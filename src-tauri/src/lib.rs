use serde::{Deserialize, Serialize};
use std::{fs, io::ErrorKind, path::PathBuf};
use tauri::Manager;

#[derive(Debug, Default, Serialize, Deserialize)]
struct Data {
    #[serde(alias = "categories")]
    collections: Vec<Collection>,
    commands: Vec<Command>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Collection {
    id: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Command {
    id: String,
    name: String,
    body: String,
    #[serde(alias = "category_id")]
    collection_id: Option<String>,
    #[serde(default)]
    favorite: bool,
}

fn data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("command_pad.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Data, String> {
    let path = data_path(&app)?;
    match fs::read_to_string(path) {
        Ok(json) => {
            serde_json::from_str(&json).map_err(|error| format!("Invalid data file: {error}"))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Data::default()),
        Err(error) => Err(format!("Could not read data: {error}")),
    }
}

#[tauri::command]
fn save_data(app: tauri::AppHandle, data: Data) -> Result<(), String> {
    let path = data_path(&app)?;
    let directory = path.parent().ok_or("Invalid data directory")?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let json = serde_json::to_vec_pretty(&data).map_err(|error| error.to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, json).map_err(|error| format!("Could not write data: {error}"))?;
    fs::rename(temp, path).map_err(|error| format!("Could not replace data file: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![load_data, save_data])
        .run(tauri::generate_context!())
        .expect("error while running Command Pad");
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
        let json = serde_json::to_value(data).unwrap();
        assert!(json.get("collections").is_some());
        assert!(json.get("categories").is_none());
        assert_eq!(json["commands"][0]["favorite"], false);
    }
}
