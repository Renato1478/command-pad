//! Per-file workspace mutations.
//!
//! Tree operations are intentionally done one file/directory at a time. A
//! failure part-way through returns an error and never pretends the whole
//! operation was atomic.

use crate::{
    workspace::{open_workspace, paths, revision},
    workspace_format::{encode_command, CommandFile, CommandMetadata},
    Command,
};
use serde::Deserialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CommandDraft {
    pub id: String,
    pub name: String,
    pub body: String,
    pub favorite: bool,
    pub collection_id: Option<String>,
    pub folder_id: Option<String>,
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Cannot create {}: {error}", path.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("Cannot write {}: {error}", path.display()))?;
    file.sync_all()
        .map_err(|error| format!("Cannot sync {}: {error}", path.display()))
}

fn write_metadata(directory: &Path, marker: &str, id: &str) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&serde_json::json!({ "id": id }))
        .map_err(|error| error.to_string())?;
    write_new(&directory.join(marker), &bytes)
}

pub fn add_collection(root: &Path, id: &str, name: &str) -> Result<(), String> {
    open_workspace(root)?;
    paths::require_valid_name(name)?;
    let directory = root.join("collections").join(name.trim());
    fs::create_dir(&directory).map_err(|error| format!("Cannot create collection: {error}"))?;
    if let Err(error) = write_metadata(&directory, ".collection.json", id) {
        let _ = fs::remove_dir(&directory);
        return Err(error);
    }
    Ok(())
}

pub fn rename_collection(root: &Path, id: &str, new_name: &str) -> Result<(), String> {
    paths::require_valid_name(new_name)?;
    let path = paths::collection(root, id)?;
    let destination = path.with_file_name(new_name.trim());
    if destination.exists() {
        return Err("A collection with that name already exists".into());
    }
    fs::rename(&path, destination).map_err(|error| format!("Cannot rename collection: {error}"))
}

pub fn delete_collection(root: &Path, id: &str) -> Result<(), String> {
    let path = paths::collection(root, id)?;
    fs::remove_dir_all(&path).map_err(|error| format!("Cannot delete collection: {error}"))
}

pub fn add_folder(
    root: &Path,
    id: &str,
    collection_id: &str,
    parent_id: Option<&str>,
    name: &str,
) -> Result<(), String> {
    paths::require_valid_name(name)?;
    let parent = match parent_id {
        Some(parent_id) => paths::folder(root, collection_id, parent_id)?,
        None => paths::collection(root, collection_id)?,
    };
    let directory = parent.join(name.trim());
    fs::create_dir(&directory).map_err(|error| format!("Cannot create folder: {error}"))?;
    if let Err(error) = write_metadata(&directory, ".folder.json", id) {
        let _ = fs::remove_dir(&directory);
        return Err(error);
    }
    Ok(())
}

pub fn update_folder(
    root: &Path,
    id: &str,
    collection_id: &str,
    _parent_id: Option<&str>,
    new_name: &str,
    move_parent_id: Option<&str>,
) -> Result<(), String> {
    paths::require_valid_name(new_name)?;
    let current = paths::folder(root, collection_id, id)?;
    let target_parent = match move_parent_id {
        Some(parent_id) => paths::folder(root, collection_id, parent_id)?,
        None => paths::collection(root, collection_id)?,
    };
    if target_parent.starts_with(&current) {
        return Err("A folder cannot be moved inside itself".into());
    }
    let destination = target_parent.join(new_name.trim());
    if destination.exists() {
        return Err("A folder with that name already exists".into());
    }
    fs::rename(&current, destination).map_err(|error| format!("Cannot move folder: {error}"))
}

pub fn delete_folder(root: &Path, collection_id: &str, id: &str) -> Result<(), String> {
    let path = paths::folder(root, collection_id, id)?;
    fs::remove_dir_all(&path).map_err(|error| format!("Cannot delete folder: {error}"))
}

fn command_path(root: &Path, draft: &CommandDraft) -> Result<PathBuf, String> {
    let collection_id = draft
        .collection_id
        .as_deref()
        .ok_or("A command must be in a collection")?;
    let parent = match draft.folder_id.as_deref() {
        Some(folder_id) => paths::folder(root, collection_id, folder_id)?,
        None => paths::collection(root, collection_id)?,
    };
    Ok(parent.join(format!("{}.cmd.md", draft.name.trim())))
}

pub fn add_command(root: &Path, draft: &CommandDraft) -> Result<(), String> {
    paths::require_valid_name(&draft.name)?;
    let path = command_path(root, draft)?;
    let body = encode_command(&CommandFile {
        metadata: CommandMetadata {
            id: draft.id.clone(),
            favorite: draft.favorite,
        },
        body: draft.body.clone(),
    })?;
    write_new(&path, body.as_bytes())
}

pub fn update_command(
    root: &Path,
    draft: &CommandDraft,
    old_path: &str,
    expected_revision: &str,
) -> Result<(), String> {
    paths::require_valid_name(&draft.name)?;
    revision::path_matches(root, old_path, expected_revision)?;
    let previous = root.join(old_path);
    let path = command_path(root, draft)?;
    let body = encode_command(&CommandFile {
        metadata: CommandMetadata {
            id: draft.id.clone(),
            favorite: draft.favorite,
        },
        body: draft.body.clone(),
    })?;
    let same_path = path == previous;
    if !same_path && path.exists() {
        return Err("A command with that name already exists".into());
    }
    let temp = path.with_extension(format!("cmd.md.{}.tmp", std::process::id()));
    fs::write(&temp, body).map_err(|error| format!("Cannot write command: {error}"))?;
    fs::rename(&temp, &path).map_err(|error| format!("Cannot replace command: {error}"))?;
    if !same_path {
        fs::remove_file(&previous).map_err(|error| {
            format!("Command moved, but the old file could not be removed: {error}")
        })?;
        let _ = paths::remove_parent_if_empty(&previous);
    }
    Ok(())
}

pub fn delete_command(root: &Path, old_path: &str, expected_revision: &str) -> Result<(), String> {
    revision::path_matches(root, old_path, expected_revision)?;
    let path = root.join(old_path);
    fs::remove_file(&path).map_err(|error| format!("Cannot delete command: {error}"))?;
    let _ = paths::remove_parent_if_empty(&path);
    Ok(())
}

pub fn command_from_relative(root: &Path, relative: &str) -> Result<Command, String> {
    let path = root.join(relative);
    let bytes = fs::read(&path).map_err(|error| format!("Cannot read command: {error}"))?;
    let text = String::from_utf8(bytes).map_err(|_| "Command file is not UTF-8")?;
    let parsed = crate::workspace_format::decode_command(&text)?;
    let title = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_suffix(".cmd.md"))
        .ok_or("Invalid command filename")?;
    Ok(Command {
        id: parsed.metadata.id,
        name: title.to_owned(),
        body: parsed.body,
        collection_id: None,
        folder_id: None,
        favorite: parsed.metadata.favorite,
    })
}
