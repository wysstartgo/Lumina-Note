import { useState, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { FileEntry, deleteFile, renameFile, createFile } from "@/lib/tauri";
import { cn, getFileName } from "@/lib/utils";
import { ContextMenu, MenuItem, menuItems } from "./ContextMenu";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  MoreHorizontal,
  Calendar,
  BrainCircuit,
  Sun,
  Moon,
  Plus,
} from "lucide-react";

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry | null;
  isDirectory: boolean;
}

export function Sidebar() {
  const { vaultPath, fileTree, currentFile, openFile, refreshFileTree, isLoadingTree, closeFile } =
    useFileStore();
  const { isDarkMode, toggleTheme } = useUIStore();
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry,
      isDirectory: entry.is_dir,
    });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle delete
  const handleDelete = useCallback(async (entry: FileEntry) => {
    if (!confirm(`确定要删除 "${entry.name}" 吗？`)) return;
    try {
      await deleteFile(entry.path);
      if (currentFile === entry.path) {
        closeFile();
      }
      refreshFileTree();
    } catch (error) {
      console.error("Delete failed:", error);
      alert("删除失败");
    }
  }, [currentFile, closeFile, refreshFileTree]);

  // Handle rename
  const handleStartRename = useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path);
    setRenameValue(entry.name.replace(/\.md$/, ""));
  }, []);

  const handleRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }
    
    const separator = renamingPath.includes("\\") ? "\\" : "/";
    const parentDir = renamingPath.substring(0, renamingPath.lastIndexOf(separator));
    const newPath = `${parentDir}${separator}${renameValue.trim()}.md`;
    
    if (newPath === renamingPath) {
      setRenamingPath(null);
      return;
    }
    
    try {
      await renameFile(renamingPath, newPath);
      refreshFileTree();
      if (currentFile === renamingPath) {
        openFile(newPath);
      }
    } catch (error) {
      console.error("Rename failed:", error);
      alert("重命名失败");
    }
    setRenamingPath(null);
  }, [renamingPath, renameValue, refreshFileTree, currentFile, openFile]);

  // Handle copy path
  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, []);

  // Handle show in explorer - placeholder for now
  const handleShowInExplorer = useCallback(async (path: string) => {
    // For now, just copy the path. Full shell integration requires plugin setup.
    try {
      await navigator.clipboard.writeText(path);
      alert(`路径已复制：${path}\n\n请在资源管理器中粘贴打开`);
    } catch (error) {
      console.error("Failed:", error);
    }
  }, []);

  // Handle new file
  const handleNewFile = useCallback(async (parentPath?: string) => {
    const basePath = parentPath || vaultPath;
    if (!basePath) return;
    
    const separator = basePath.includes("\\") ? "\\" : "/";
    const fileName = prompt("输入文件名（不含扩展名）：");
    if (!fileName?.trim()) return;
    
    const newPath = `${basePath}${separator}${fileName.trim()}.md`;
    try {
      await createFile(newPath);
      refreshFileTree();
      openFile(newPath);
    } catch (error) {
      console.error("Create file failed:", error);
      alert("创建文件失败");
    }
  }, [vaultPath, refreshFileTree, openFile]);

  // Build context menu items
  const getContextMenuItems = useCallback((entry: FileEntry): MenuItem[] => {
    const items: MenuItem[] = [];
    
    if (entry.is_dir) {
      items.push(menuItems.newFile(() => handleNewFile(entry.path)));
    }
    
    items.push(menuItems.copyPath(() => handleCopyPath(entry.path)));
    items.push(menuItems.showInExplorer(() => handleShowInExplorer(entry.path)));
    
    if (!entry.is_dir) {
      items.push(menuItems.rename(() => handleStartRename(entry)));
    }
    
    items.push(menuItems.delete(() => handleDelete(entry)));
    
    return items;
  }, [handleNewFile, handleCopyPath, handleShowInExplorer, handleStartRename, handleDelete]);

  return (
    <aside className="w-full h-full border-r border-border flex flex-col bg-muted/30 dark:bg-[#252526] transition-colors duration-300">
      {/* Header */}
      <div className="p-3 flex items-center justify-between text-xs font-bold text-muted-foreground tracking-wider uppercase">
        <span>资源管理器</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleNewFile()}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="新建文件"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refreshFileTree}
            disabled={isLoadingTree}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="刷新"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isLoadingTree && "animate-spin")}
            />
          </button>
          <button className="p-1 hover:bg-accent rounded transition-colors">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Daily Note Quick Action */}
      <div className="px-2 mb-2">
        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background dark:bg-[#2d2d2d] hover:bg-accent dark:hover:bg-[#37373d] border border-border rounded-md transition-colors shadow-sm">
          <Calendar size={14} />
          <span>今日速记</span>
        </button>
      </div>

      {/* Vault Name */}
      <div className="px-3 py-2 text-sm font-medium truncate border-b border-border">
        {vaultPath?.split(/[/\\]/).pop() || "Notes"}
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-auto py-2">
        {fileTree.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            未找到 Markdown 文件
          </div>
        ) : (
          fileTree.map((entry) => (
            <FileTreeItem
              key={entry.path}
              entry={entry}
              currentFile={currentFile}
              onSelect={openFile}
              onContextMenu={handleContextMenu}
              level={0}
              renamingPath={renamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              onRenameSubmit={handleRename}
              onRenameCancel={() => setRenamingPath(null)}
            />
          ))
        )}
      </div>
      
      {/* Context Menu */}
      {contextMenu && contextMenu.entry && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.entry)}
          onClose={closeContextMenu}
        />
      )}

      {/* Status Bar */}
      <div className="p-3 border-t border-border text-xs text-muted-foreground flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>索引: 已同步</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1 rounded hover:bg-accent transition-colors"
            title="切换深色/浅色模式"
          >
            {isDarkMode ? (
              <Sun size={14} className="text-yellow-400" />
            ) : (
              <Moon size={14} />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 opacity-70">
          <BrainCircuit size={12} />
          <span>模型: Claude 3.5 Sonnet</span>
        </div>
      </div>
    </aside>
  );
}

interface FileTreeItemProps {
  entry: FileEntry;
  currentFile: string | null;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  level: number;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}

function FileTreeItem({ 
  entry, 
  currentFile, 
  onSelect, 
  onContextMenu,
  level,
  renamingPath,
  renameValue,
  setRenameValue,
  onRenameSubmit,
  onRenameCancel,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isActive = currentFile === entry.path;
  const isRenaming = renamingPath === entry.path;
  const paddingLeft = 12 + level * 16;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onRenameSubmit();
    } else if (e.key === "Escape") {
      onRenameCancel();
    }
  };

  if (entry.is_dir) {
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          onContextMenu={(e) => onContextMenu(e, entry)}
          className="w-full flex items-center gap-1.5 py-1.5 hover:bg-accent transition-colors text-sm"
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{entry.name}</span>
        </button>

        {isExpanded && entry.children && (
          <div>
            {entry.children.map((child) => (
              <FileTreeItem
                key={child.path}
                entry={child}
                currentFile={currentFile}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                level={level + 1}
                renamingPath={renamingPath}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File item with rename support
  if (isRenaming) {
    return (
      <div
        className="flex items-center gap-1.5 py-1 px-1"
        style={{ paddingLeft: paddingLeft + 16 }}
      >
        <File className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 bg-background border border-primary rounded px-1.5 py-0.5 text-sm outline-none"
        />
        <span className="text-muted-foreground text-sm">.md</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      onContextMenu={(e) => onContextMenu(e, entry)}
      className={cn(
        "w-full flex items-center gap-1.5 py-1.5 transition-colors text-sm",
        isActive
          ? "bg-primary/10 text-primary"
          : "hover:bg-accent"
      )}
      style={{ paddingLeft: paddingLeft + 20 }}
    >
      <File className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="truncate">{getFileName(entry.name)}</span>
    </button>
  );
}
