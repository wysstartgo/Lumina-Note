import { invoke } from "@tauri-apps/api/core";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

/**
 * Read file content from disk
 */
export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/**
 * Save file content to disk
 */
export async function saveFile(path: string, content: string): Promise<void> {
  return invoke("save_file", { path, content });
}

/**
 * List directory contents (recursive, .md files only)
 */
export async function listDirectory(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_directory", { path });
}

/**
 * Create a new file
 */
export async function createFile(path: string): Promise<void> {
  return invoke("create_file", { path });
}

/**
 * Delete a file or directory
 */
export async function deleteFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

/**
 * Rename/move a file
 */
export async function renameFile(
  oldPath: string,
  newPath: string
): Promise<void> {
  return invoke("rename_file", { oldPath, newPath });
}
