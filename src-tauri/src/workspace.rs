//! Filesystem workspace discovery and initialization.

use crate::{workspace_format::decode_command, Collection, Command, Data, Folder};

pub use revision::CommandRevisions;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

const METADATA_DIR: &str = ".cmdpad";
const MANIFEST: &str = "workspace.json";
const FORMAT: &str = "cmdpad-workspace";
const VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceManifest {
    pub format: String,
    pub version: u32,
    pub id: String,
    pub name: String,
}

/// Initializes only an existing, empty directory; never replaces existing files.
pub fn create_workspace(root: &Path, id: &str, name: &str) -> Result<WorkspaceManifest, String> {
    if id.trim().is_empty() || name.trim().is_empty() {
        return Err("Workspace ID and name are required".into());
    }
    let metadata = fs::symlink_metadata(root)
        .map_err(|error| format!("Cannot access workspace directory: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Workspace must be an existing directory, not a symbolic link".into());
    }
    let mut entries =
        fs::read_dir(root).map_err(|error| format!("Cannot read workspace directory: {error}"))?;
    if entries
        .next()
        .transpose()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("Choose an empty directory to create a workspace".into());
    }

    let manifest = WorkspaceManifest {
        format: FORMAT.into(),
        version: VERSION,
        id: id.into(),
        name: name.trim().into(),
    };
    // Claim the directory first. If creation is interrupted, do not silently
    // interpret an incomplete directory as an empty workspace.
    let metadata_dir = root.join(METADATA_DIR);
    fs::create_dir(&metadata_dir)
        .map_err(|error| format!("Cannot initialize workspace: {error}"))?;
    fs::create_dir(root.join("collections"))
        .map_err(|error| format!("Cannot create collections directory: {error}"))?;
    fs::create_dir(root.join("unfiled"))
        .map_err(|error| format!("Cannot create unfiled directory: {error}"))?;
    let bytes = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(metadata_dir.join(MANIFEST))
        .map_err(|error| format!("Cannot create workspace manifest: {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("Cannot write workspace manifest: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Cannot sync workspace manifest: {error}"))?;
    Ok(manifest)
}

pub fn rename_workspace(root: &Path, name: &str) -> Result<WorkspaceManifest, String> {
    let mut manifest = open_workspace(root)?;
    let name = name.trim();
    if name.is_empty() {
        return Err("Workspace name is required".into());
    }
    manifest.name = name.to_owned();
    let bytes = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    let metadata_dir = root.join(METADATA_DIR);
    let temp = metadata_dir.join("workspace.json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("Cannot write workspace manifest: {error}"))?;
    fs::rename(&temp, metadata_dir.join(MANIFEST))
        .map_err(|error| format!("Cannot replace workspace manifest: {error}"))?;
    Ok(manifest)
}

pub fn open_workspace(root: &Path) -> Result<WorkspaceManifest, String> {
    let metadata =
        fs::symlink_metadata(root).map_err(|error| format!("Cannot access workspace: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Workspace path is not a directory".into());
    }
    for name in [METADATA_DIR, "collections", "unfiled"] {
        let metadata = fs::symlink_metadata(root.join(name))
            .map_err(|error| format!("Cannot access workspace directory {name}: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(format!("Invalid workspace directory: {name}"));
        }
    }
    let manifest_path = root.join(METADATA_DIR).join(MANIFEST);
    let metadata = fs::symlink_metadata(&manifest_path)
        .map_err(|error| format!("Cannot access workspace manifest: {error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Invalid workspace manifest".into());
    }
    let bytes = fs::read(manifest_path)
        .map_err(|error| format!("Cannot read workspace manifest: {error}"))?;
    let manifest: WorkspaceManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid workspace manifest: {error}"))?;
    if manifest.format != FORMAT || manifest.version != VERSION {
        return Err("Unsupported workspace format or version".into());
    }
    if manifest.id.trim().is_empty() || manifest.name.trim().is_empty() {
        return Err("Invalid workspace identity".into());
    }
    Ok(manifest)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DirectoryMetadata {
    id: String,
}

fn directory_id(path: &Path, marker: &str) -> Result<Option<String>, String> {
    let path = path.join(marker);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot inspect {}: {error}", path.display())),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("Invalid metadata file: {}", path.display()));
    }
    let contents =
        fs::read(&path).map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
    let metadata: DirectoryMetadata = serde_json::from_slice(&contents)
        .map_err(|error| format!("Invalid metadata in {}: {error}", path.display()))?;
    if metadata.id.trim().is_empty() {
        return Err(format!("Missing ID in {}", path.display()));
    }
    Ok(Some(metadata.id))
}

fn add_id(ids: &mut HashSet<String>, id: &str) -> Result<(), String> {
    if !ids.insert(id.to_owned()) {
        return Err(format!("Duplicate workspace ID: {id}"));
    }
    Ok(())
}

fn entry_name(entry: &fs::DirEntry) -> Result<String, String> {
    entry
        .file_name()
        .into_string()
        .map_err(|_| format!("Non-UTF-8 name in {}", entry.path().display()))
}

fn scan_commands_and_folders(
    directory: &Path,
    collection_id: Option<&str>,
    parent_id: Option<&str>,
    data: &mut Data,
    ids: &mut HashSet<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Cannot read {}: {error}", directory.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Cannot read workspace entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Cannot inspect {}: {error}", entry.path().display()))?;
        if file_type.is_symlink() {
            continue;
        }
        let name = entry_name(&entry)?;
        if file_type.is_dir() {
            let Some(collection_id) = collection_id else {
                continue;
            };
            let Some(id) = directory_id(&entry.path(), ".folder.json")? else {
                continue;
            };
            add_id(ids, &id)?;
            data.folders.push(Folder {
                id: id.clone(),
                collection_id: collection_id.to_owned(),
                parent_id: parent_id.map(str::to_owned),
                name,
            });
            scan_commands_and_folders(&entry.path(), Some(collection_id), Some(&id), data, ids)?;
        } else if file_type.is_file() {
            let Some(title) = name.strip_suffix(".cmd.md") else {
                continue;
            };
            if title.trim().is_empty() {
                return Err(format!(
                    "Command filename has no title: {}",
                    entry.path().display()
                ));
            }
            let content = fs::read_to_string(entry.path())
                .map_err(|error| format!("Cannot read {}: {error}", entry.path().display()))?;
            let parsed = decode_command(&content)
                .map_err(|error| format!("Invalid command {}: {error}", entry.path().display()))?;
            add_id(ids, &parsed.metadata.id)?;
            data.commands.push(Command {
                id: parsed.metadata.id,
                name: title.to_owned(),
                body: parsed.body,
                collection_id: collection_id.map(str::to_owned),
                folder_id: parent_id.map(str::to_owned),
                favorite: parsed.metadata.favorite,
            });
        }
    }
    Ok(())
}

pub fn read_workspace(root: &Path) -> Result<Data, String> {
    open_workspace(root)?;
    let mut data = Data::default();
    let mut ids = HashSet::new();
    scan_commands_and_folders(&root.join("unfiled"), None, None, &mut data, &mut ids)?;
    for entry in fs::read_dir(root.join("collections"))
        .map_err(|error| format!("Cannot read collections: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Cannot read collection: {error}"))?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let Some(id) = directory_id(&entry.path(), ".collection.json")? else {
            continue;
        };
        add_id(&mut ids, &id)?;
        data.collections.push(Collection {
            id: id.clone(),
            name: entry_name(&entry)?,
        });
        scan_commands_and_folders(&entry.path(), Some(&id), None, &mut data, &mut ids)?;
    }
    data.collections.sort_by(|a, b| a.id.cmp(&b.id));
    data.folders.sort_by(|a, b| a.id.cmp(&b.id));
    data.commands.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("cmdpad-workspace-{}-{suffix}", std::process::id()));
        fs::create_dir(&path).unwrap();
        path
    }

    #[test]
    fn creates_and_opens_workspace() {
        let root = temp_dir();
        let manifest = create_workspace(&root, "test-id", "Team").unwrap();
        assert_eq!(open_workspace(&root).unwrap(), manifest);
        assert!(create_workspace(&root, "another", "Other").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn does_not_initialize_nonempty_directory() {
        let root = temp_dir();
        fs::write(root.join("important.txt"), "keep me").unwrap();
        assert!(create_workspace(&root, "id", "Name").is_err());
        assert_eq!(
            fs::read_to_string(root.join("important.txt")).unwrap(),
            "keep me"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_nested_workspace_and_ignores_unrelated_files() {
        use crate::workspace_format::{encode_command, CommandFile, CommandMetadata};

        let root = temp_dir();
        create_workspace(&root, "id", "Team").unwrap();
        let collection = root.join("collections").join("Git");
        let folder = collection.join("Maintenance");
        fs::create_dir(&collection).unwrap();
        fs::create_dir(&folder).unwrap();
        fs::write(collection.join(".collection.json"), r#"{"id":"git"}"#).unwrap();
        fs::write(folder.join(".folder.json"), r#"{"id":"maintenance"}"#).unwrap();
        let file = CommandFile {
            metadata: CommandMetadata {
                id: "status".into(),
                favorite: true,
            },
            body: "git status\n".into(),
        };
        fs::write(folder.join("Status.cmd.md"), encode_command(&file).unwrap()).unwrap();
        fs::write(folder.join("notes.txt"), "ignored").unwrap();
        let data = read_workspace(&root).unwrap();
        assert_eq!(data.collections[0].name, "Git");
        assert_eq!(data.folders[0].parent_id, None);
        assert_eq!(data.commands[0].name, "Status");
        assert_eq!(data.commands[0].body, "git status\n");
        assert_eq!(data.commands[0].folder_id.as_deref(), Some("maintenance"));
        assert!(data.commands[0].favorite);
        fs::remove_dir_all(root).unwrap();
    }
}

pub mod commands;
pub mod mutations;
pub mod paths;
pub mod revision;

#[cfg(test)]
mod mutation_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("cmdpad-{}-{suffix}", std::process::id()));
        fs::create_dir(&path).unwrap();
        path
    }

    #[test]
    fn renames_workspace_without_changing_its_id() {
        let root = temp_dir();
        create_workspace(&root, "stable-id", "Old").unwrap();
        let renamed = rename_workspace(&root, "  New name  ").unwrap();
        assert_eq!(renamed.id, "stable-id");
        assert_eq!(open_workspace(&root).unwrap().name, "New name");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn writes_commands_with_revision_checks_and_moves() {
        let root = temp_dir();
        create_workspace(&root, "id", "Team").unwrap();
        mutations::add_collection(&root, "git", "Git").unwrap();
        mutations::add_folder(&root, "utils", "git", None, "Utils").unwrap();
        let draft = mutations::CommandDraft {
            id: "status".into(),
            name: "Status".into(),
            body: "git status\n".into(),
            favorite: false,
            collection_id: Some("git".into()),
            folder_id: None,
        };
        mutations::add_command(&root, &draft).unwrap();
        let revisions = revision::collect(&root).unwrap();
        let revision = revisions.0.get("status").unwrap();

        let moved = mutations::CommandDraft {
            folder_id: Some("utils".into()),
            ..draft.clone()
        };
        mutations::update_command(&root, &moved, &revision.path, &revision.fingerprint).unwrap();
        let data = read_workspace(&root).unwrap();
        assert_eq!(data.commands[0].folder_id.as_deref(), Some("utils"));

        let stale = mutations::CommandDraft {
            body: "changed\n".into(),
            ..moved.clone()
        };
        assert!(
            mutations::update_command(&root, &stale, &revision.path, &revision.fingerprint)
                .is_err()
        );

        let current = revision::collect(&root).unwrap();
        let current_revision = current.0.get("status").unwrap();
        mutations::delete_command(&root, &current_revision.path, &current_revision.fingerprint)
            .unwrap();
        assert!(read_workspace(&root).unwrap().commands.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
