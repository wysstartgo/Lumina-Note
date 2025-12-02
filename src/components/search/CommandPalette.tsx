import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { FileEntry } from "@/lib/tauri";
import { cn, getFileName } from "@/lib/utils";
import {
  Search,
  FolderOpen,
  Plus,
  Sun,
  Moon,
  Sidebar,
  MessageSquare,
  Network,
  Command,
  FileText,
} from "lucide-react";

export type PaletteMode = "command" | "file" | "search";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface FileItem {
  path: string;
  name: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  mode: PaletteMode;
  onClose: () => void;
  onModeChange: (mode: PaletteMode) => void;
}

export function CommandPalette({ isOpen, mode, onClose, onModeChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { 
    fileTree, 
    openFile, 
    createNewFile,
    vaultPath,
    openGraphTab,
    tabs,
    clearVault,
  } = useFileStore();

  const {
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleTheme,
    isDarkMode,
  } = useUIStore();
  
  // Check if graph tab is open
  const isGraphOpen = tabs.some(tab => tab.type === "graph");

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, mode]);

  // Flatten file tree
  const allFiles = useMemo(() => {
    const result: FileItem[] = [];
    const flatten = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          flatten(entry.children);
        } else if (!entry.is_dir) {
          result.push({ path: entry.path, name: getFileName(entry.name) });
        }
      }
    };
    flatten(fileTree);
    return result;
  }, [fileTree]);

  // Commands list
  const commands = useMemo<CommandItem[]>(() => [
    {
      id: "new-file",
      label: "新建笔记",
      description: "创建新的 Markdown 笔记",
      icon: <Plus size={16} />,
      shortcut: "Ctrl+N",
      action: () => {
        onClose();
        createNewFile();
      },
    },
    {
      id: "quick-open",
      label: "快速打开",
      description: "搜索并打开笔记",
      icon: <Search size={16} />,
      shortcut: "Ctrl+O",
      action: () => onModeChange("file"),
    },
    {
      id: "toggle-left-sidebar",
      label: "切换左侧边栏",
      description: "显示/隐藏文件树",
      icon: <Sidebar size={16} />,
      action: () => {
        onClose();
        toggleLeftSidebar();
      },
    },
    {
      id: "toggle-right-sidebar",
      label: "切换右侧边栏",
      description: "显示/隐藏 AI 面板",
      icon: <MessageSquare size={16} />,
      action: () => {
        onClose();
        toggleRightSidebar();
      },
    },
    {
      id: "toggle-theme",
      label: isDarkMode ? "切换到浅色模式" : "切换到深色模式",
      description: "切换应用主题",
      icon: isDarkMode ? <Sun size={16} /> : <Moon size={16} />,
      action: () => {
        onClose();
        toggleTheme();
      },
    },
    {
      id: "show-graph",
      label: isGraphOpen ? "切换到关系图谱" : "打开关系图谱",
      description: "查看笔记之间的链接关系",
      icon: <Network size={16} />,
      action: () => {
        onClose();
        openGraphTab();
      },
    },
    {
      id: "switch-workspace",
      label: "切换工作空间",
      description: `当前: ${vaultPath ? vaultPath.split(/[/\\]/).pop() : "未选择"}`,
      icon: <FolderOpen size={16} />,
      action: () => {
        onClose();
        clearVault();  // 清除当前工作空间，回到欢迎页
      },
    },
    {
      id: "global-search",
      label: "全局搜索",
      description: "在所有笔记中搜索内容",
      icon: <Search size={16} />,
      shortcut: "Ctrl+Shift+F",
      action: () => {
        onClose();
        window.dispatchEvent(new CustomEvent("open-global-search"));
      },
    },
  ], [onClose, createNewFile, onModeChange, toggleLeftSidebar, toggleRightSidebar, toggleTheme, isDarkMode, openGraphTab, isGraphOpen, vaultPath]);

  // Filter items based on query and mode
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    
    if (mode === "command") {
      if (!q) return commands;
      return commands.filter(cmd => 
        cmd.label.toLowerCase().includes(q) || 
        cmd.description?.toLowerCase().includes(q)
      );
    }
    
    if (mode === "file") {
      if (!q) return allFiles.slice(0, 20);
      return allFiles.filter(f => 
        f.name.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q)
      ).slice(0, 20);
    }
    
    return [];
  }, [mode, query, commands, allFiles]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Execute selected item
  const executeItem = useCallback((index: number) => {
    if (mode === "command") {
      const cmd = filteredItems[index] as CommandItem;
      cmd?.action();
    } else if (mode === "file") {
      const file = filteredItems[index] as FileItem;
      if (file) {
        onClose();
        openFile(file.path);
      }
    }
  }, [mode, filteredItems, onClose, openFile]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        executeItem(selectedIndex);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "Tab":
        e.preventDefault();
        // Switch between modes
        if (mode === "command") {
          onModeChange("file");
        } else {
          onModeChange("command");
        }
        break;
    }
  }, [filteredItems.length, selectedIndex, executeItem, onClose, mode, onModeChange]);

  if (!isOpen) return null;

  const placeholder = mode === "command" 
    ? "输入命令..." 
    : mode === "file"
    ? "输入文件名搜索..."
    : "搜索笔记内容...";

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      
      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50">
        <div className="bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Input area */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Command size={16} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {/* Mode tabs */}
            <div className="flex gap-1 text-xs">
              <button
                onClick={() => onModeChange("command")}
                className={cn(
                  "px-2 py-1 rounded transition-colors",
                  mode === "command" 
                    ? "bg-primary/20 text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                命令
              </button>
              <button
                onClick={() => onModeChange("file")}
                className={cn(
                  "px-2 py-1 rounded transition-colors",
                  mode === "file" 
                    ? "bg-primary/20 text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                文件
              </button>
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                没有找到匹配项
              </div>
            ) : (
              filteredItems.map((item, index) => {
                if (mode === "command") {
                  const cmd = item as CommandItem;
                  return (
                    <button
                      key={cmd.id}
                      data-index={index}
                      onClick={() => executeItem(index)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        index === selectedIndex 
                          ? "bg-accent text-accent-foreground" 
                          : "hover:bg-muted"
                      )}
                    >
                      <span className="text-muted-foreground">{cmd.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {cmd.description}
                          </div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                } else {
                  const file = item as FileItem;
                  return (
                    <button
                      key={file.path}
                      data-index={index}
                      onClick={() => executeItem(index)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        index === selectedIndex 
                          ? "bg-accent text-accent-foreground" 
                          : "hover:bg-muted"
                      )}
                    >
                      <FileText size={16} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {file.path}
                        </div>
                      </div>
                    </button>
                  );
                }
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4">
            <span>
              <kbd className="bg-muted px-1 rounded">↑↓</kbd> 选择
            </span>
            <span>
              <kbd className="bg-muted px-1 rounded">Enter</kbd> 确认
            </span>
            <span>
              <kbd className="bg-muted px-1 rounded">Tab</kbd> 切换模式
            </span>
            <span>
              <kbd className="bg-muted px-1 rounded">Esc</kbd> 关闭
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
