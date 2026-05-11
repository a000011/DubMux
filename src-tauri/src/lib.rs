use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
struct FolderEntry {
    path: String,
}

#[tauri::command]
fn scan_folder(folder_path: String) -> Result<Vec<FolderEntry>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() {
        return Err("Folder does not exist".into());
    }

    let entries = fs::read_dir(path).map_err(|error| error.to_string())?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if metadata.is_file() {
            files.push(FolderEntry {
                path: entry.path().to_string_lossy().into_owned(),
            });
        }
    }

    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}