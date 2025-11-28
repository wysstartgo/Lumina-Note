import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  FileText,
  Network,
  Search,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Ribbon() {
  const { isDarkMode, toggleTheme } = useUIStore();
  const { tabs, activeTabIndex, openGraphTab, switchTab } = useFileStore();
  
  // Check active tab type
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const isGraphActive = activeTab?.type === "graph";
  
  // Find first file tab to switch to
  const handleSwitchToFiles = () => {
    const fileTabIndex = tabs.findIndex(tab => tab.type === "file");
    if (fileTabIndex !== -1) {
      switchTab(fileTabIndex);
    }
  };

  return (
    <div className="w-12 h-full bg-muted/30 border-r border-border flex flex-col items-center py-2 gap-1">
      {/* Top icons */}
      <div className="flex flex-col items-center gap-1">
        {/* Files/Editor */}
        <button
          onClick={handleSwitchToFiles}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            !isGraphActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="文件编辑器"
        >
          <FileText size={20} />
        </button>

        {/* Graph */}
        <button
          onClick={openGraphTab}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            isGraphActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="关系图谱"
        >
          <Network size={20} />
        </button>

        {/* Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-global-search"))}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="全局搜索 (Ctrl+Shift+F)"
        >
          <Search size={20} />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title={isDarkMode ? "切换到亮色模式" : "切换到暗色模式"}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Settings */}
        <button
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="设置 (开发中)"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
}
