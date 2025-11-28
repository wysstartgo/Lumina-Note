import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Message,
  FileReference,
  EditSuggestion,
  AIConfig,
  chat,
  parseFileReferences,
  parseEditSuggestions,
  applyEdit,
  setAIConfig,
  getAIConfig,
} from "@/lib/ai";
import { readFile } from "@/lib/tauri";

// Pending diff for preview
export interface PendingDiff {
  fileName: string;
  filePath: string;
  original: string;
  modified: string;
  description: string;
}

// Token usage tracking
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

interface AIState {
  // Config
  config: AIConfig;
  setConfig: (config: Partial<AIConfig>) => void;

  // Chat
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  
  // Token usage
  tokenUsage: TokenUsage;
  totalTokensUsed: number;

  // File references
  referencedFiles: FileReference[];
  addFileReference: (path: string, name: string) => Promise<void>;
  removeFileReference: (path: string) => void;
  clearFileReferences: () => void;

  // Edit suggestions
  pendingEdits: EditSuggestion[];
  clearPendingEdits: () => void;
  
  // Diff preview
  pendingDiff: PendingDiff | null;
  setPendingDiff: (diff: PendingDiff | null) => void;

  // Actions
  sendMessage: (content: string, currentFile?: { path: string; name: string; content: string }) => Promise<void>;
  clearChat: () => void;
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      // Config
      config: getAIConfig(),
      setConfig: (newConfig) => {
        setAIConfig(newConfig);
        set({ config: getAIConfig() });
      },

      // Chat state
      messages: [],
      isLoading: false,
      error: null,
      
      // Token usage
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      totalTokensUsed: 0,

      // File references
      referencedFiles: [],
      addFileReference: async (path, name) => {
        try {
          const content = await readFile(path);
          set((state) => ({
            referencedFiles: [
              ...state.referencedFiles.filter((f) => f.path !== path),
              { path, name, content },
            ],
          }));
        } catch (error) {
          console.error("Failed to read file:", error);
        }
      },
      removeFileReference: (path) => {
        set((state) => ({
          referencedFiles: state.referencedFiles.filter((f) => f.path !== path),
        }));
      },
      clearFileReferences: () => {
        set({ referencedFiles: [] });
      },

      // Edit suggestions
      pendingEdits: [],
      clearPendingEdits: () => {
        set({ pendingEdits: [], pendingDiff: null });
      },
      
      // Diff preview
      pendingDiff: null,
      setPendingDiff: (diff) => {
        set({ pendingDiff: diff });
      },

      // Send message
      sendMessage: async (content, currentFile) => {
        const { messages, referencedFiles, config } = get();

        if (!config.apiKey) {
          set({ error: "请先在设置中配置 API Key" });
          return;
        }

        // Parse @file references in message
        const fileRefs = parseFileReferences(content);
        
        // Add user message
        const userMessage: Message = { role: "user", content };
        set({
          messages: [...messages, userMessage],
          isLoading: true,
          error: null,
        });

        try {
          // Load any new referenced files
          for (const ref of fileRefs) {
            const existing = referencedFiles.find(
              (f) => f.path.includes(ref) || f.name.includes(ref)
            );
            if (!existing) {
              // Try to find and load the file
              // For now, assume it's in the vault
              await get().addFileReference(ref, ref);
            }
          }

          // Determine which files to send to AI
          // If user has manually added files, use those
          // Otherwise, use the current focused file
          let filesToSend = get().referencedFiles;
          if (filesToSend.length === 0 && currentFile) {
            filesToSend = [currentFile];
          }

          // Call AI
          const response = await chat(
            [...messages, userMessage],
            filesToSend
          );

          // Parse edit suggestions from content
          const edits = parseEditSuggestions(response.content);
          console.log("[AI] Parsed edits:", edits);

          // Update token usage
          const newUsage = response.usage ? {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens,
          } : { prompt: 0, completion: 0, total: 0 };

          // Add assistant message and update tokens
          set((state) => ({
            messages: [...state.messages, { role: "assistant" as const, content: response.content }],
            pendingEdits: edits.length > 0 ? edits : state.pendingEdits,
            tokenUsage: newUsage,
            totalTokensUsed: state.totalTokensUsed + newUsage.total,
            isLoading: false,
          }));
          
          // Auto-show diff after a short delay (to avoid render issues)
          if (edits.length > 0 && filesToSend.length > 0) {
            // Capture the data we need before setTimeout
            const edit = edits[0];
            const file = filesToSend.find(f => 
              f.path?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase()) ||
              f.name?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase())
            ) || filesToSend[0];
            
            if (file && file.content && file.path) {
              console.log("=== DEBUG: Auto Diff ===");
              console.log("[1] File name:", file.name);
              console.log("[2] File path:", file.path);
              console.log("[3] File content (first 200 chars):", file.content.substring(0, 200));
              console.log("[4] Edit filePath:", edit.filePath);
              console.log("[5] Edit originalContent:", edit.originalContent);
              console.log("[6] Edit newContent:", edit.newContent);
              console.log("[7] Does file contain originalContent?", file.content.includes(edit.originalContent));
              
              const modified = applyEdit(file.content, edit);
              console.log("[8] Modified length:", modified.length, "Original length:", file.content.length);
              console.log("[9] Content changed:", modified !== file.content);
              console.log("[10] Modified (first 200 chars):", modified.substring(0, 200));
              
              if (modified !== file.content) {
                // Capture values for closure
                const diffData = {
                  fileName: file.name,
                  filePath: file.path,
                  original: file.content,
                  modified,
                  description: edit.description,
                };
                // Delay setting pendingDiff to let UI settle
                setTimeout(() => {
                  get().setPendingDiff(diffData);
                }, 100);
              }
            }
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "发送消息失败",
            isLoading: false,
          });
        }
      },

      // Clear chat
      clearChat: () => {
        set({
          messages: [],
          pendingEdits: [],
          error: null,
        });
      },
    }),
    {
      name: "neurone-ai",
      partialize: (state) => ({
        config: state.config,
      }),
    }
  )
);
