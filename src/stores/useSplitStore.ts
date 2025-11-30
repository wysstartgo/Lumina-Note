import { create } from "zustand";
import { readFile, saveFile } from "@/lib/tauri";
import { parseFrontmatter } from "@/lib/frontmatter";

// Secondary editor state for split view
interface SplitState {
  // Secondary file
  secondaryFile: string | null;
  secondaryContent: string;
  secondaryIsDirty: boolean;
  isLoadingSecondary: boolean;
  
  // Actions
  openSecondaryFile: (path: string) => Promise<void>;
  updateSecondaryContent: (content: string) => void;
  saveSecondary: () => Promise<void>;
  closeSecondary: () => void;
  swapPanels: () => void;
  reloadSecondaryIfOpen: (path: string) => Promise<void>;
}

export const useSplitStore = create<SplitState>((set, get) => ({
  secondaryFile: null,
  secondaryContent: "",
  secondaryIsDirty: false,
  isLoadingSecondary: false,

  openSecondaryFile: async (path: string) => {
    set({ isLoadingSecondary: true });
    try {
      const content = await readFile(path);
      set({
        secondaryFile: path,
        secondaryContent: content,
        secondaryIsDirty: false,
        isLoadingSecondary: false,
      });
    } catch (error) {
      console.error("Failed to open secondary file:", error);
      set({ isLoadingSecondary: false });
    }
  },

  updateSecondaryContent: (content: string) => {
    set({ secondaryContent: content, secondaryIsDirty: true });
  },

  saveSecondary: async () => {
    const { secondaryFile, secondaryContent, secondaryIsDirty } = get();
    if (!secondaryFile || !secondaryIsDirty) return;
    
    try {
      await saveFile(secondaryFile, secondaryContent);
      set({ secondaryIsDirty: false });
      
      // 检查是否属于某个数据库，如果是则刷新数据库
      const { frontmatter, hasFrontmatter } = parseFrontmatter(secondaryContent);
      if (hasFrontmatter && frontmatter.db) {
        // 动态导入以避免循环依赖
        const { useDatabaseStore } = await import("./useDatabaseStore");
        useDatabaseStore.getState().refreshRows(frontmatter.db as string);
      }
    } catch (error) {
      console.error("Failed to save secondary file:", error);
    }
  },

  closeSecondary: () => {
    set({
      secondaryFile: null,
      secondaryContent: "",
      secondaryIsDirty: false,
    });
  },

  swapPanels: () => {
    // This will be handled at the UI level by swapping with main store
  },
  
  // Reload secondary file if it's currently open (for external updates)
  reloadSecondaryIfOpen: async (path: string) => {
    const { secondaryFile } = get();
    if (secondaryFile !== path) return;
    
    try {
      const content = await readFile(path);
      set({
        secondaryContent: content,
        secondaryIsDirty: false,
      });
    } catch (error) {
      console.error(`Failed to reload secondary file ${path}:`, error);
    }
  },
}));
