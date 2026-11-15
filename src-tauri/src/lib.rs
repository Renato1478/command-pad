use serde::{Deserialize, Serialize};
use std::{fs, io::ErrorKind, path::PathBuf};
use tauri::Manager;

#[derive(Debug, Default, Serialize, Deserialize)]
struct Data {
    categories: Vec<Category>,
    commands: Vec<Command>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Category {
    id: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Command {
    id: String,
    name: String,
    body: String,
    category_id: Option<String>,
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
        .invoke_handler(tauri::generate_handler![load_data, save_data])
        .run(tauri::generate_context!())
        .expect("error while running Command Pad");
}
