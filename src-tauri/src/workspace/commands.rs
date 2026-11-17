//! Tauri commands for filesystem workspaces.
//!
//! Paths come from the user's directory picker. They are validated as real
//! directories/manifests, never interpreted as shell commands.

use crate::{
    workspace::{
        create_workspace, mutations, open_workspace, paths, read_workspace,
        revision::{self, CommandRevisions},
    },
    Data,
};
use serde::Serialize;
use std::{fs, path::Path};
use tauri::Manager;

#[derive(Serialize)]
pub struct WorkspaceSnapshot {
    pub manifest: crate::workspace::WorkspaceManifest,
    pub data: Data,
    pub path: String,
}

/// Creates a workspace inside the app's own data directory.
#[tauri::command]
pub fn create_local_workspace(
    app: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("workspaces")
        .join(&id);
    let parent = directory.parent().ok_or("Invalid workspace directory")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create workspace directory: {error}"))?;
    fs::create_dir(&directory)
        .map_err(|error| format!("Cannot create workspace directory: {error}"))?;
    let manifest = match create_workspace(&directory, &id, &name) {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = fs::remove_dir(&directory);
            return Err(error);
        }
    };
    Ok(WorkspaceSnapshot {
        manifest,
        data: Data::default(),
        path: directory.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn create_workspace_files(
    path: String,
    id: String,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let root = Path::new(&path);
    let manifest = create_workspace(root, &id, &name)?;
    Ok(WorkspaceSnapshot {
        manifest,
        data: Data::default(),
        path,
    })
}

#[tauri::command]
pub fn open_workspace_files(path: String) -> Result<WorkspaceSnapshot, String> {
    let root = Path::new(&path);
    let manifest = open_workspace(root)?;
    Ok(WorkspaceSnapshot {
        manifest,
        data: read_workspace(root)?,
        path,
    })
}

#[tauri::command]
pub fn rename_workspace_files(path: String, name: String) -> Result<(), String> {
    crate::workspace::rename_workspace(Path::new(&path), &name)?;
    Ok(())
}

#[tauri::command]
pub fn load_workspace(path: String) -> Result<Data, String> {
    read_workspace(Path::new(&path))
}

#[tauri::command]
pub fn workspace_revisions(path: String) -> Result<CommandRevisions, String> {
    revision::collect(Path::new(&path))
}

#[tauri::command]
pub fn add_workspace_collection(path: String, id: String, name: String) -> Result<(), String> {
    mutations::add_collection(Path::new(&path), &id, &name)
}

#[tauri::command]
pub fn rename_workspace_collection(path: String, id: String, name: String) -> Result<(), String> {
    mutations::rename_collection(Path::new(&path), &id, &name)
}

#[tauri::command]
pub fn delete_workspace_collection(path: String, id: String) -> Result<(), String> {
    mutations::delete_collection(Path::new(&path), &id)
}

#[tauri::command]
pub fn add_workspace_folder(
    path: String,
    id: String,
    collection_id: String,
    parent_id: Option<String>,
    name: String,
) -> Result<(), String> {
    mutations::add_folder(
        Path::new(&path),
        &id,
        &collection_id,
        parent_id.as_deref(),
        &name,
    )
}

#[tauri::command]
pub fn update_workspace_folder(
    path: String,
    id: String,
    collection_id: String,
    parent_id: Option<String>,
    name: String,
    move_parent_id: Option<String>,
) -> Result<(), String> {
    mutations::update_folder(
        Path::new(&path),
        &id,
        &collection_id,
        parent_id.as_deref(),
        &name,
        move_parent_id.as_deref(),
    )
}

#[tauri::command]
pub fn delete_workspace_folder(
    path: String,
    collection_id: String,
    id: String,
) -> Result<(), String> {
    mutations::delete_folder(Path::new(&path), &collection_id, &id)
}

#[tauri::command]
pub fn add_workspace_command(path: String, draft: mutations::CommandDraft) -> Result<(), String> {
    mutations::add_command(Path::new(&path), &draft)
}

#[tauri::command]
pub fn update_workspace_command(
    path: String,
    draft: mutations::CommandDraft,
    old_path: String,
    expected_revision: String,
) -> Result<(), String> {
    mutations::update_command(Path::new(&path), &draft, &old_path, &expected_revision)
}

#[tauri::command]
pub fn delete_workspace_command(
    path: String,
    old_path: String,
    expected_revision: String,
) -> Result<(), String> {
    mutations::delete_command(Path::new(&path), &old_path, &expected_revision)
}

#[tauri::command]
pub fn validate_workspace_name(name: String) -> Result<(), String> {
    paths::require_valid_name(&name)
}
