/**
 * 可折叠的对话历史列表组件
 * 参考设计：默认折叠显示图标，展开显示完整列表
 */

import { useState } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useAgentStore } from "@/stores/useAgentStore";
import {
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  className?: string;
}

export function ConversationList({ className }: ConversationListProps) {
  const { chatMode } = useUIStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // Chat mode sessions
  const {
    sessions: chatSessions,
    currentSessionId: chatCurrentId,
    createSession: createChatSession,
    deleteSession: deleteChatSession,
    switchSession: switchChatSession,
  } = useAIStore();

  // Agent mode sessions
  const {
    sessions: agentSessions,
    currentSessionId: agentCurrentId,
    createSession: createAgentSession,
    deleteSession: deleteAgentSession,
    switchSession: switchAgentSession,
  } = useAgentStore();

  // 合并所有会话并标记类型，按更新时间排序
  const allSessions = [
    ...agentSessions.map((s) => ({ ...s, type: "agent" as const })),
    ...chatSessions.map((s) => ({ ...s, type: "chat" as const })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleNewConversation = () => {
    if (chatMode === "agent") {
      // 获取当前 agent session
      const currentSession = agentSessions.find(s => s.id === agentCurrentId);
      // 如果当前 session 是空的，不做任何事
      if (currentSession && currentSession.messages.length === 0) {
        return;
      }
      // 找一个空的 agent session
      const emptySession = agentSessions.find(s => s.messages.length === 0);
      if (emptySession) {
        // 切换到空 session
        switchAgentSession(emptySession.id);
      } else {
        // 创建新 session
        createAgentSession();
      }
    } else {
      // Chat mode
      const currentSession = chatSessions.find(s => s.id === chatCurrentId);
      if (currentSession && currentSession.messages.length === 0) {
        return;
      }
      const emptySession = chatSessions.find(s => s.messages.length === 0);
      if (emptySession) {
        switchChatSession(emptySession.id);
      } else {
        createChatSession();
      }
    }
  };

  const handleSwitchSession = (id: string, type: "agent" | "chat") => {
    if (type === "agent") {
      switchAgentSession(id);
      // 如果当前不是 agent 模式，切换过去
      if (chatMode !== "agent") {
        useUIStore.getState().setChatMode("agent");
      }
    } else {
      switchChatSession(id);
      if (chatMode !== "chat") {
        useUIStore.getState().setChatMode("chat");
      }
    }
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string, type: "agent" | "chat") => {
    e.stopPropagation();
    if (type === "agent") {
      deleteAgentSession(id);
    } else {
      deleteChatSession(id);
    }
  };

  const isCurrentSession = (id: string, type: "agent" | "chat") => {
    if (type === "agent") {
      return chatMode === "agent" && agentCurrentId === id;
    }
    return chatMode === "chat" && chatCurrentId === id;
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-border bg-muted/30 transition-all duration-300 ease-in-out",
        isExpanded ? "w-48" : "w-12",
        className
      )}
    >
      {/* 顶部：折叠按钮 + 新建按钮 */}
      <div className="p-2 border-b border-border flex flex-col gap-2 items-center">
        {/* 折叠/展开按钮 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors w-full flex justify-center"
          title={isExpanded ? "收起列表" : "展开列表"}
        >
          {isExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        {/* 新建对话按钮 */}
        <button
          onClick={handleNewConversation}
          className={cn(
            "flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all",
            isExpanded ? "w-full py-2 px-3" : "w-8 h-8 rounded-full"
          )}
          title="新建对话"
        >
          <Plus size={18} />
          {isExpanded && (
            <span className="text-xs font-medium whitespace-nowrap">新建对话</span>
          )}
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {allSessions.map((session) => {
          const isActive = isCurrentSession(session.id, session.type);
          const Icon = session.type === "agent" ? Bot : MessageSquare;

          return (
            <div
              key={session.id}
              onClick={() => handleSwitchSession(session.id, session.type)}
              className={cn(
                "group flex items-center px-2 py-2.5 cursor-pointer transition-all border-l-2",
                isActive
                  ? "border-primary bg-background shadow-sm"
                  : "border-transparent hover:bg-background/50 hover:shadow-sm"
              )}
              title={session.title}
            >
              {/* 图标 */}
              <div className="min-w-[32px] flex justify-center">
                <Icon
                  size={16}
                  className={cn(
                    session.type === "agent" ? "text-purple-500" : "text-slate-500",
                    isActive && "text-primary"
                  )}
                />
              </div>

              {/* 标题 - 只有展开时显示 */}
              {isExpanded && (
                <>
                  <div className="flex-1 overflow-hidden ml-1">
                    <p
                      className={cn(
                        "text-xs truncate",
                        isActive ? "text-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {session.title}
                    </p>
                    {/* 类型标签 */}
                    {session.type === "agent" && (
                      <span className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-1.5 rounded-full inline-block mt-0.5">
                        Agent
                      </span>
                    )}
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => handleDeleteSession(e, session.id, session.type)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-opacity"
                    title="删除对话"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {allSessions.length === 0 && (
          <div className="px-2 py-4 text-center">
            {isExpanded ? (
              <p className="text-xs text-muted-foreground">暂无对话</p>
            ) : (
              <MessageSquare size={16} className="mx-auto text-muted-foreground/50" />
            )}
          </div>
        )}
      </div>

      {/* 底部：清空历史（展开时显示） */}
      {isExpanded && allSessions.length > 0 && (
        <div className="p-2 border-t border-border">
          <button
            onClick={() => {
              // 清空当前模式的所有会话，保留一个空会话
              if (chatMode === "agent") {
                agentSessions.forEach((s) => {
                  if (s.id !== agentCurrentId) deleteAgentSession(s.id);
                });
              } else {
                chatSessions.forEach((s) => {
                  if (s.id !== chatCurrentId) deleteChatSession(s.id);
                });
              }
            }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 w-full py-1 rounded hover:bg-accent transition-colors"
          >
            <Trash2 size={12} />
            清空历史
          </button>
        </div>
      )}
    </div>
  );
}
