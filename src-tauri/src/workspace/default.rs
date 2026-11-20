//! The Default workspace: created on first launch and migrated from the old
//! JSON library when possible.

use crate::{
    workspace::{create_workspace, mutations, mutations::CommandDraft, open_workspace},
    Data,
};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    sync::Mutex,
};

pub const DEFAULT_ID: &str = "default";
pub const DEFAULT_NAME: &str = "Default";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceHandle {
    pub id: String,
    pub name: String,
    pub path: String,
}

static LOCK: Mutex<()> = Mutex::new(());

/// Opens the Default workspace, creating it if needed. A legacy JSON library
/// is copied into a fresh workspace before the JSON file is renamed.
pub fn ensure_default_workspace(root: &Path, legacy: &Path) -> Result<WorkspaceHandle, String> {
    let _guard = LOCK
        .lock()
        .map_err(|_| "The Default workspace could not be locked")?;

    if !root.exists() {
        create(root, legacy)?;
    }

    let manifest = open_workspace(root)?;
    Ok(WorkspaceHandle {
        id: manifest.id,
        name: manifest.name,
        path: root.to_string_lossy().into_owned(),
    })
}

fn create(root: &Path, legacy: &Path) -> Result<(), String> {
    let parent = root.parent().ok_or("Invalid Default workspace path")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create the Default workspace directory: {error}"))?;

    if !legacy.is_file() {
        fs::create_dir(root)
            .map_err(|error| format!("Cannot create the Default workspace directory: {error}"))?;
        return create_workspace(root, DEFAULT_ID, DEFAULT_NAME).map(|_| ());
    }

    // Build in a sibling directory so a partially migrated workspace is never
    // mistaken for a complete one.
    let staging = root.with_file_name(format!(
        ".{}-migrating",
        root.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("default-workspace")
    ));
    if staging.exists() {
        fs::remove_dir_all(&staging)
            .map_err(|error| format!("Cannot clear an old migration directory: {error}"))?;
    }
    fs::create_dir(&staging)
        .map_err(|error| format!("Cannot create the migration directory: {error}"))?;
    create_workspace(&staging, DEFAULT_ID, DEFAULT_NAME)?;

    if migrate(&staging, legacy).is_err() {
        // Keep the app usable even when the old library is unreadable.
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir(root)
            .map_err(|error| format!("Cannot create the Default workspace directory: {error}"))?;
        return create_workspace(root, DEFAULT_ID, DEFAULT_NAME).map(|_| ());
    }

    fs::rename(&staging, root)
        .map_err(|error| format!("Cannot finish the Default workspace: {error}"))?;
    backup_legacy(legacy);
    Ok(())
}

fn backup_legacy(legacy: &Path) {
    let backup = legacy.with_extension("json.migrated");
    let _ = fs::remove_file(&backup);
    let _ = fs::rename(legacy, backup);
}

fn migrate(root: &Path, legacy: &Path) -> Result<(), String> {
    let bytes =
        fs::read(legacy).map_err(|error| format!("Cannot read the existing library: {error}"))?;
    let data: Data = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Cannot read the existing library: {error}"))?;
    write_data(root, &data)
}

fn write_data(root: &Path, data: &Data) -> Result<(), String> {
    let mut collection_names = HashSet::new();
    let mut collections = HashSet::new();
    for collection in &data.collections {
        let name = unique_name(safe_name(&collection.name), &mut collection_names);
        mutations::add_collection(root, &collection.id, &name)?;
        collections.insert(collection.id.clone());
    }

    let folder_ids: HashSet<&str> = data.folders.iter().map(|f| f.id.as_str()).collect();
    let mut folder_collection = HashMap::new();
    for folder in &data.folders {
        if collections.contains(&folder.collection_id) {
            folder_collection.insert(folder.id.clone(), folder.collection_id.clone());
        }
    }

    // Attach folders to roots that exist, then add them parent-first.
    let mut pending: Vec<(String, String, Option<String>, String)> = data
        .folders
        .iter()
        .filter_map(|folder| {
            let collection_id = folder_collection.get(&folder.id)?.clone();
            let parent_id = folder.parent_id.clone().filter(|parent| {
                folder_ids.contains(parent.as_str())
                    && folder_collection.get(parent) == Some(&collection_id)
            });
            Some((
                folder.id.clone(),
                collection_id,
                parent_id,
                folder.name.clone(),
            ))
        })
        .collect();

    let mut folder_names: HashMap<(String, String), HashSet<String>> = HashMap::new();
    let mut added = HashSet::new();
    while !pending.is_empty() {
        let mut next = Vec::new();
        let mut progress = false;
        for (id, collection_id, parent_id, name) in pending {
            if parent_id.as_ref().is_some_and(|p| !added.contains(p)) {
                next.push((id, collection_id, parent_id, name));
                continue;
            }
            let key = folder_key(&collection_id, parent_id.as_deref());
            let name = unique_name(safe_name(&name), folder_names.entry(key).or_default());
            mutations::add_folder(root, &id, &collection_id, parent_id.as_deref(), &name)?;
            added.insert(id);
            progress = true;
        }
        pending = next;
        if pending.is_empty() {
            break;
        }
        if !progress {
            // Corrupt cycles: keep the folders, but at the collection root.
            for (id, collection_id, _, name) in pending.drain(..) {
                let key = folder_key(&collection_id, None);
                let name = unique_name(safe_name(&name), folder_names.entry(key).or_default());
                mutations::add_folder(root, &id, &collection_id, None, &name)?;
            }
        }
    }

    let mut command_names: HashMap<(String, String), HashSet<String>> = HashMap::new();
    for command in &data.commands {
        let collection_id = command
            .collection_id
            .clone()
            .filter(|id| collections.contains(id));
        let folder_id = command.folder_id.clone().filter(|folder| {
            collection_id
                .as_ref()
                .is_some_and(|id| folder_collection.get(folder) == Some(id))
        });
        let key = folder_key(collection_id.as_deref().unwrap_or(""), folder_id.as_deref());
        let name = unique_name(
            safe_name(&command.name),
            command_names.entry(key).or_default(),
        );
        mutations::add_command(
            root,
            &CommandDraft {
                id: command.id.clone(),
                name,
                body: command.body.clone(),
                favorite: command.favorite,
                collection_id,
                folder_id,
            },
        )?;
    }
    Ok(())
}

fn folder_key(collection_id: &str, folder_id: Option<&str>) -> (String, String) {
    (
        collection_id.to_owned(),
        folder_id.unwrap_or_default().to_owned(),
    )
}

fn unique_name(base: String, used: &mut HashSet<String>) -> String {
    if used.insert(base.to_lowercase()) {
        return base;
    }
    let mut index = 2;
    loop {
        let candidate = format!("{base} ({index})");
        if used.insert(candidate.to_lowercase()) {
            return candidate;
        }
        index += 1;
    }
}

fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| {
            if character.is_control() || r#"<>:"/\|?*"#.contains(character) {
                '-'
            } else {
                character
            }
        })
        .collect();
    let mut name = cleaned
        .trim()
        .trim_matches(|character| character == '.' || character == ' ')
        .chars()
        .take(100)
        .collect::<String>();
    if name.is_empty() {
        name = "Untitled".into();
    }
    let stem = name.split('.').next().unwrap_or(&name).to_ascii_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
    {
        name.insert(0, '_');
    }
    name
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::read_workspace;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("termemo-default-{}-{suffix}", std::process::id()));
        fs::create_dir(&path).unwrap();
        path
    }

    #[test]
    fn creates_and_reopens_the_default_workspace() {
        let base = temp_dir();
        let root = base.join("default-workspace");
        let handle = ensure_default_workspace(&root, &base.join("missing.json")).unwrap();
        assert_eq!(handle.id, DEFAULT_ID);
        assert_eq!(handle.name, DEFAULT_NAME);
        assert!(root.join(".cmdpad/workspace.json").is_file());
        assert_eq!(
            ensure_default_workspace(&root, &base.join("missing.json"))
                .unwrap()
                .path,
            handle.path
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn migrates_legacy_data_and_keeps_a_backup() {
        let base = temp_dir();
        let root = base.join("default-workspace");
        let legacy = base.join("command_pad.json");
        fs::write(
            &legacy,
            r#"{
                "collections":[{"id":"git","name":"Git"}],
                "folders":[{"id":"utils","collection_id":"git","parent_id":null,"name":"Utils"}],
                "commands":[
                    {"id":"1","name":"Status","body":"git status","collection_id":"git","folder_id":"utils","favorite":true},
                    {"id":"2","name":"Loose","body":"echo hi","collection_id":null,"folder_id":null}
                ]
            }"#,
        )
        .unwrap();

        let handle = ensure_default_workspace(&root, &legacy).unwrap();
        let data = read_workspace(Path::new(&handle.path)).unwrap();
        assert_eq!(data.collections[0].name, "Git");
        assert_eq!(data.folders[0].name, "Utils");
        assert!(data.commands.iter().any(|command| command.favorite));
        assert!(data
            .commands
            .iter()
            .any(|command| command.name == "Loose" && command.collection_id.is_none()));
        assert!(!legacy.exists());
        assert!(base.join("command_pad.json.migrated").is_file());

        // A second launch must not import the data twice.
        let handle = ensure_default_workspace(&root, &legacy).unwrap();
        assert_eq!(read_workspace(Path::new(&handle.path)).unwrap(), data);
        fs::remove_dir_all(base).unwrap();
    }
}
