import { create } from "zustand";
import { persist } from "zustand/middleware";

// Editor modes similar to Obsidian
export type EditorMode = "reading" | "live" | "source";

// Main view types - what shows in center area
export type MainView = "editor" | "graph";

interface UIState {
  // Theme
  isDarkMode: boolean;
  toggleTheme: () => void;

  // Panels
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  // Panel widths (in pixels)
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;

  // Right panel tabs
  rightPanelTab: "chat" | "outline" | "backlinks" | "tags";
  setRightPanelTab: (tab: "chat" | "outline" | "backlinks" | "tags") => void;

  // Chat mode (simple chat vs agent)
  chatMode: "chat" | "agent";
  setChatMode: (mode: "chat" | "agent") => void;

  // Main view (center area)
  mainView: MainView;
  setMainView: (view: MainView) => void;

  // Editor mode
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;

  // Split view
  splitView: boolean;
  splitDirection: "horizontal" | "vertical";
  toggleSplitView: () => void;
  setSplitDirection: (dir: "horizontal" | "vertical") => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Theme - default to light mode
      isDarkMode: false,
      toggleTheme: () =>
        set((state) => {
          const newMode = !state.isDarkMode;
          // Update document class for Tailwind dark mode
          if (newMode) {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
          return { isDarkMode: newMode };
        }),

      // Panels
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      toggleLeftSidebar: () =>
        set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
      toggleRightSidebar: () =>
        set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),

      // Panel widths
      leftSidebarWidth: 256,
      rightSidebarWidth: 320,
      setLeftSidebarWidth: (width) =>
        set({ leftSidebarWidth: Math.max(200, Math.min(480, width)) }),
      setRightSidebarWidth: (width) =>
        set({ rightSidebarWidth: Math.max(280, Math.min(560, width)) }),

      // Right panel tabs
      rightPanelTab: "chat",
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

      // Chat mode
      chatMode: "agent",  // 默认使用 Agent 模式
      setChatMode: (mode) => set({ chatMode: mode }),

      // Main view
      mainView: "editor",
      setMainView: (view) => set({ mainView: view }),

      // Editor mode - default to live preview
      editorMode: "live",
      setEditorMode: (mode) => set({ editorMode: mode }),

      // Split view
      splitView: false,
      splitDirection: "horizontal",
      toggleSplitView: () => set((state) => ({ splitView: !state.splitView })),
      setSplitDirection: (dir) => set({ splitDirection: dir }),
    }),
    {
      name: "neurone-ui",
      onRehydrateStorage: () => (state) => {
        // Apply theme on hydration
        if (state?.isDarkMode) {
          document.documentElement.classList.add("dark");
        }
      },
    }
  )
);
