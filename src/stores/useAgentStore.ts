/**
 * Agent 状态管理 Store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { 
  AgentStatus, 
  Message, 
  ToolCall, 
  AgentModeSlug,
  TaskContext 
} from "@/agent/types";
import { getAgentLoop, resetAgentLoop } from "@/agent/core/AgentLoop";
import { MODES } from "@/agent/modes";

interface AgentState {
  // 状态
  status: AgentStatus;
  messages: Message[];
  pendingTool: ToolCall | null;
  currentTask: string | null;
  lastError: string | null;

  // 模式
  mode: AgentModeSlug;
  setMode: (mode: AgentModeSlug) => void;

  // 配置
  autoApprove: boolean;
  setAutoApprove: (value: boolean) => void;

  // 动作
  startTask: (message: string, context: TaskContext) => Promise<void>;
  abort: () => void;
  approve: () => void;
  reject: () => void;
  clearChat: () => void;

  // 内部更新
  _updateFromLoop: () => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => {
      // 监听 Agent Loop 状态变化
      const setupListeners = () => {
        const loop = getAgentLoop();
        
        loop.on("status_change", () => {
          get()._updateFromLoop();
        });

        loop.on("message", () => {
          get()._updateFromLoop();
        });

        loop.on("tool_call", () => {
          get()._updateFromLoop();
        });

        loop.on("complete", () => {
          get()._updateFromLoop();
        });

        loop.on("error", () => {
          get()._updateFromLoop();
        });
      };

      // 延迟初始化监听器
      setTimeout(setupListeners, 0);

      return {
        // 初始状态
        status: "idle",
        messages: [],
        pendingTool: null,
        currentTask: null,
        lastError: null,

        // 模式
        mode: "editor",
        setMode: (mode) => set({ mode }),

        // 配置
        autoApprove: false,
        setAutoApprove: (value) => set({ autoApprove: value }),

        // 启动任务
        startTask: async (message, context) => {
          const { mode } = get();
          const loop = getAgentLoop();

          // 添加模式到上下文
          const fullContext: TaskContext = {
            ...context,
            mode: MODES[mode],
          };

          set({
            status: "running",
            currentTask: message,
            lastError: null,
          });

          try {
            await loop.startTask(message, fullContext);
          } catch (error) {
            set({
              status: "error",
              lastError: error instanceof Error ? error.message : "未知错误",
            });
          }

          // 更新最终状态
          get()._updateFromLoop();
        },

        // 中止任务
        abort: () => {
          const loop = getAgentLoop();
          loop.abort();
          set({ status: "aborted" });
        },

        // 审批通过
        approve: () => {
          const loop = getAgentLoop();
          loop.approveToolCall(true);
          set({ pendingTool: null });
        },

        // 审批拒绝
        reject: () => {
          const loop = getAgentLoop();
          loop.approveToolCall(false);
          set({ pendingTool: null });
        },

        // 清空聊天
        clearChat: () => {
          resetAgentLoop();
          set({
            status: "idle",
            messages: [],
            pendingTool: null,
            currentTask: null,
            lastError: null,
          });
        },

        // 从 Loop 更新状态
        _updateFromLoop: () => {
          const loop = getAgentLoop();
          const state = loop.getState();
          
          set({
            status: state.status,
            messages: state.messages.filter((m) => m.role !== "system"), // 不显示 system 消息
            pendingTool: state.pendingTool,
            currentTask: state.currentTask,
            lastError: state.lastError,
          });

          // 自动审批检查
          const { autoApprove, pendingTool } = get();
          if (autoApprove && pendingTool && state.status === "waiting_approval") {
            get().approve();
          }
        },
      };
    },
    {
      name: "lumina-agent",
      partialize: (state) => ({
        mode: state.mode,
        autoApprove: state.autoApprove,
      }),
    }
  )
);

// 导出便捷 hook
export function useAgentStatus() {
  return useAgentStore((state) => state.status);
}

export function useAgentMessages() {
  return useAgentStore((state) => state.messages);
}

export function usePendingTool() {
  return useAgentStore((state) => state.pendingTool);
}
