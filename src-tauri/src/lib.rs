use serde::{Deserialize, Serialize};

pub mod workspace;
pub mod workspace_format;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Data {
    #[serde(alias = "categories")]
    pub collections: Vec<Collection>,
    #[serde(default)]
    pub folders: Vec<Folder>,
    pub commands: Vec<Command>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Collection {
    id: String,
    name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Folder {
    id: String,
    collection_id: String,
    parent_id: Option<String>,
    name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Command {
    id: String,
    name: String,
    body: String,
    #[serde(alias = "category_id")]
    pub collection_id: Option<String>,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub favorite: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            workspace::commands::ensure_default_workspace,
            workspace::commands::create_local_workspace,
            workspace::commands::create_workspace_files,
            workspace::commands::open_workspace_files,
            workspace::commands::rename_workspace_files,
            workspace::commands::load_workspace,
            workspace::commands::workspace_revisions,
            workspace::commands::add_workspace_collection,
            workspace::commands::rename_workspace_collection,
            workspace::commands::delete_workspace_collection,
            workspace::commands::add_workspace_folder,
            workspace::commands::update_workspace_folder,
            workspace::commands::delete_workspace_folder,
            workspace::commands::add_workspace_command,
            workspace::commands::update_workspace_command,
            workspace::commands::delete_workspace_command,
            workspace::commands::validate_workspace_name,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Termemo");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_legacy_categories_and_preserves_commands() {
        let data: Data = serde_json::from_str(
            r#"{"categories":[{"id":"git","name":"Git"}],"commands":[{"id":"1","name":"Status","body":"git status","category_id":"git"}]}"#,
        ).unwrap();
        assert_eq!(data.collections[0].name, "Git");
        assert_eq!(data.commands[0].collection_id.as_deref(), Some("git"));
        assert!(!data.commands[0].favorite);
        assert!(data.folders.is_empty());
        assert!(data.commands[0].folder_id.is_none());
        let json = serde_json::to_value(data).unwrap();
        assert!(json.get("collections").is_some());
        assert!(json.get("categories").is_none());
        assert_eq!(json["folders"], serde_json::json!([]));
        assert_eq!(json["commands"][0]["favorite"], false);
    }

    #[test]
    fn round_trips_nested_folders() {
        let json = r#"{
            "collections":[{"id":"git","name":"Git"}],
            "folders":[
                {"id":"utils","collection_id":"git","parent_id":null,"name":"Utils"},
                {"id":"devops","collection_id":"git","parent_id":"utils","name":"Devops"}
            ],
            "commands":[
                {"id":"1","name":"Deploy","body":"./deploy.sh","collection_id":"git","folder_id":"devops","favorite":true}
            ]
        }"#;
        let data: Data = serde_json::from_str(json).unwrap();
        assert_eq!(data.folders[1].parent_id.as_deref(), Some("utils"));
        assert_eq!(data.commands[0].folder_id.as_deref(), Some("devops"));
        let saved = serde_json::to_string(&data).unwrap();
        let restored: Data = serde_json::from_str(&saved).unwrap();
        assert_eq!(restored.folders.len(), 2);
        assert_eq!(restored.commands[0].folder_id.as_deref(), Some("devops"));
    }
}
