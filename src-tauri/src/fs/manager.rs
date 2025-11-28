use std::fs;
use std::path::Path;
use walkdir::WalkDir;
use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

/// Read file content as UTF-8 string
pub fn read_file_content(path: &str) -> Result<String, AppError> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    fs::read_to_string(path).map_err(AppError::from)
}

/// Write content to file, creating parent directories if needed
pub fn write_file_content(path: &str, content: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).map_err(AppError::from)
}

/// List directory contents recursively (only .md files)
pub fn list_dir_recursive(path: &str) -> Result<Vec<FileEntry>, AppError> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(AppError::FileNotFound(path.to_string()));
    }
    if !root.is_dir() {
        return Err(AppError::InvalidPath("Path is not a directory".to_string()));
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and directories
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let children = list_dir_recursive(&path.to_string_lossy())?;
            // Only include directories that have .md files
            if !children.is_empty() || has_md_files(&path) {
                entries.push(FileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                    children: Some(children),
                });
            }
        } else if name.ends_with(".md") {
            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

fn has_md_files(dir: &Path) -> bool {
    WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .any(|e| e.path().extension().map_or(false, |ext| ext == "md"))
}

/// Create a new .md file
pub fn create_new_file(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    if path.exists() {
        return Err(AppError::FileExists(path.display().to_string()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, "").map_err(AppError::from)
}

/// Delete a file or empty directory
pub fn delete_entry(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

/// Rename/move a file or directory
pub fn rename_entry(old_path: &str, new_path: &str) -> Result<(), AppError> {
    let old = Path::new(old_path);
    let new = Path::new(new_path);
    if !old.exists() {
        return Err(AppError::FileNotFound(old_path.to_string()));
    }
    if new.exists() {
        return Err(AppError::FileExists(new_path.to_string()));
    }
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(old, new).map_err(AppError::from)
}
