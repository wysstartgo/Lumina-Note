/**
 * Agent 状态管理器
 */

import { AgentState, AgentStatus, Message, ToolCall, AgentEvent, AgentEventHandler, AgentEventType } from "../types";

export class StateManager {
  private state: AgentState;
  private listeners: Map<AgentEventType, Set<AgentEventHandler>> = new Map();

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): AgentState {
    return {
      status: "idle",
      messages: [],
      currentTask: null,
      pendingTool: null,
      consecutiveErrors: 0,
      lastError: null,
    };
  }

  // ============ 状态获取 ============

  getState(): AgentState {
    return { ...this.state };
  }

  getStatus(): AgentStatus {
    return this.state.status;
  }

  getMessages(): Message[] {
    return [...this.state.messages];
  }

  getPendingTool(): ToolCall | null {
    return this.state.pendingTool;
  }

  // ============ 状态更新 ============

  setStatus(status: AgentStatus): void {
    const previousStatus = this.state.status;
    this.state.status = status;
    
    if (previousStatus !== status) {
      this.emit("status_change", { previousStatus, newStatus: status });
    }
  }

  setTask(task: string | null): void {
    this.state.currentTask = task;
  }

  addMessage(message: Message): void {
    this.state.messages.push(message);
    this.emit("message", message);
  }

  setMessages(messages: Message[]): void {
    this.state.messages = messages;
  }

  setPendingTool(tool: ToolCall | null): void {
    this.state.pendingTool = tool;
    if (tool) {
      this.emit("tool_call", tool);
    }
  }

  incrementErrors(): void {
    this.state.consecutiveErrors++;
  }

  resetErrors(): void {
    this.state.consecutiveErrors = 0;
  }

  getConsecutiveErrors(): number {
    return this.state.consecutiveErrors;
  }

  setError(error: string | null): void {
    this.state.lastError = error;
    if (error) {
      this.emit("error", { error });
    }
  }

  // ============ 重置 ============

  reset(): void {
    this.state = this.getInitialState();
    this.emit("status_change", { previousStatus: this.state.status, newStatus: "idle" });
  }

  // ============ 事件系统 ============

  on(event: AgentEventType, handler: AgentEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  off(event: AgentEventType, handler: AgentEventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(type: AgentEventType, data: unknown): void {
    const event: AgentEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    this.listeners.get(type)?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`[StateManager] Event handler error:`, error);
      }
    });
  }
}
