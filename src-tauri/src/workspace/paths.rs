//! Resolve workspace IDs to directories by reading their metadata markers.
//! Names are presentation data; IDs remain stable across renames.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;

#[derive(Deserialize)]
struct IdMetadata {
    id: String,
}

pub fn require_valid_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Name is required".into());
    }
    if name == "." || name == ".." || name.starts_with('.') {
        return Err("Names cannot start with a dot or be . or ..".into());
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return Err("Names cannot end with a space or period".into());
    }
    if name.encode_utf16().count() > 120 {
        return Err("Name is too long".into());
    }
    if name
        .chars()
        .any(|character| character.is_control() || r#"<>:"/\|?*"#.contains(character))
    {
        return Err("Names cannot contain < > : \" / \\ | ? *".into());
    }
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
    {
        return Err("That name is reserved by Windows".into());
    }
    Ok(())
}

fn read_id(directory: &Path, marker: &str) -> Result<Option<String>, String> {
    let path = directory.join(marker);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot read {}: {error}", path.display())),
    };
    let metadata: IdMetadata = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid {}: {error}", path.display()))?;
    if metadata.id.trim().is_empty() {
        return Err(format!("Missing ID in {}", path.display()));
    }
    Ok(Some(metadata.id))
}

fn find(directory: &Path, marker: &str, id: &str) -> Result<Option<PathBuf>, String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        if read_id(&entry.path(), marker)?.as_deref() == Some(id) {
            return Ok(Some(entry.path()));
        }
    }
    Ok(None)
}

pub fn collection(root: &Path, id: &str) -> Result<PathBuf, String> {
    find(&root.join("collections"), ".collection.json", id)?
        .ok_or_else(|| "Collection not found in workspace".into())
}

pub fn folder(root: &Path, collection_id: &str, id: &str) -> Result<PathBuf, String> {
    find_deep(&collection(root, collection_id)?, id)?
        .ok_or_else(|| "Folder not found in workspace".into())
}

fn find_deep(directory: &Path, id: &str) -> Result<Option<PathBuf>, String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        if read_id(&entry.path(), ".folder.json")?.as_deref() == Some(id) {
            return Ok(Some(entry.path()));
        }
        if let Some(found) = find_deep(&entry.path(), id)? {
            return Ok(Some(found));
        }
    }
    Ok(None)
}
