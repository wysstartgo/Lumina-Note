import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useAgentStore } from "@/stores/useAgentStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getAgentLoop } from "@/agent/core/AgentLoop";
import { useRAGStore } from "@/stores/useRAGStore";
import { useFileStore } from "@/stores/useFileStore";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles } from "@/hooks/useChatSend";
import { parseMarkdown } from "@/lib/markdown";
import { join } from "@/lib/path";
import {
  ArrowUp,
  Bot,
  FileText,
  Sparkles,
  X,
  Zap,
  Paperclip,
  Square,
  Plus,
  History,
  Trash2,
  MessageSquare,
  Mic,
  MicOff,
  Folder,
  AlertCircle,
  Check,
  Settings,
} from "lucide-react";
import { AgentMessageRenderer } from "../chat/AgentMessageRenderer";
import type { ReferencedFile } from "@/hooks/useChatSend";
import { AISettingsModal } from "../ai/AISettingsModal";
import type { MessageContent, TextContent } from "@/services/llm";

// 从消息内容中提取文本（处理多模态内容）
function getTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(item => item.type === 'text')
    .map(item => (item as TextContent).text)
    .join('\n');
}

// 随机黄豆 emoji 列表
const WELCOME_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
  "😊", "😍", "🤩", "😘", "😗", "😋", "😜", "🤪", "😝", "🤑",
  "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏",
  "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "🥳", "🤠",
  "🧐", "🤓", "😎",
];

// 快捷操作卡片数据 - 动态获取翻译
function getQuickActions(t: ReturnType<typeof useLocaleStore.getState>['t']) {
  return [
    { icon: Sparkles, label: t.ai.polishText, desc: t.ai.polishTextDesc, mode: "chat" as const, prompt: "帮我润色这段文字：" },
    { icon: FileText, label: t.ai.summarizeNote, desc: t.ai.summarizeNoteDesc, mode: "chat" as const, prompt: "帮我总结当前笔记的要点" },
    { icon: Zap, label: t.ai.writeArticle, desc: t.ai.writeArticleDesc, mode: "agent" as const, prompt: "帮我写一篇关于" },
    { icon: Bot, label: t.ai.studyNotes, desc: t.ai.studyNotesDesc, mode: "agent" as const, prompt: "帮我创建一份关于 __ 的学习笔记" },
  ];
}

// 建议卡片组件
function SuggestionCard({
  icon: Icon,
  title,
  desc,
  onClick
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-muted/40 hover:bg-muted/70 p-4 rounded-xl cursor-pointer border border-transparent hover:border-border transition-colors flex flex-col items-start gap-1 text-left"
    >
      <div className="p-2 bg-background rounded-lg shadow-sm text-muted-foreground mb-1">
        <Icon size={18} />
      </div>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </motion.button>
  );
}


export function MainAIChatShell() {
  const { t } = useLocaleStore();
  const { chatMode, setChatMode } = useUIStore();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 随机选择一个 emoji（组件挂载时确定）
  const [welcomeEmoji] = useState(() =>
    WELCOME_EMOJIS[Math.floor(Math.random() * WELCOME_EMOJIS.length)]
  );

  // Agent store
  const {
    status: agentStatus,
    messages: agentMessages,
    sessions: agentSessions,
    currentSessionId: agentSessionId,
    createSession: createAgentSession,
    switchSession: switchAgentSession,
    deleteSession: deleteAgentSession,
    pendingTool,
    approve,
    reject,
    startTask,
    abort: agentAbort,
    checkFirstLoad: checkAgentFirstLoad,
    lastIntent,
    llmRequestStartTime,
    retryTimeout,
  } = useAgentStore();

  // Chat store - 使用 selector 确保状态变化时正确重新渲染
  const chatMessages = useAIStore((state) => state.messages);
  const chatSessions = useAIStore((state) => state.sessions);
  const chatSessionId = useAIStore((state) => state.currentSessionId);
  const createChatSession = useAIStore((state) => state.createSession);
  const switchChatSession = useAIStore((state) => state.switchSession);
  const deleteChatSession = useAIStore((state) => state.deleteSession);
  const chatLoading = useAIStore((state) => state.isLoading);
  const chatStreaming = useAIStore((state) => state.isStreaming);
  const streamingContent = useAIStore((state) => state.streamingContent);
  const sendMessageStream = useAIStore((state) => state.sendMessageStream);
  const stopStreaming = useAIStore((state) => state.stopStreaming);
  const checkChatFirstLoad = useAIStore((state) => state.checkFirstLoad);
  const config = useAIStore((state) => state.config);
  const chatTotalTokens = useAIStore((state) => state.totalTokensUsed);
  const agentTotalTokens = useAgentStore((state) => {
    const session = state.sessions.find((s) => s.id === state.currentSessionId);
    return session?.totalTokensUsed ?? 0;
  });

  useRAGStore();
  useAgentStore();

  // 根据模式获取对应的会话数据
  const sessions = chatMode === "agent" ? agentSessions : chatSessions;
  const currentSessionId = chatMode === "agent" ? agentSessionId : chatSessionId;
  const createSession = chatMode === "agent" ? createAgentSession : createChatSession;
  const switchSession = chatMode === "agent" ? switchAgentSession : switchChatSession;
  const deleteSession = chatMode === "agent" ? deleteAgentSession : deleteChatSession;

  const { vaultPath, currentFile, currentContent, fileTree, openFile } = useFileStore();

  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  // 扁平化文件树
  const flattenFileTree = useCallback((entries: any[], result: ReferencedFile[] = []): ReferencedFile[] => {
    for (const entry of entries) {
      result.push({
        path: entry.path,
        name: entry.name,
        isFolder: entry.is_dir,
      });
      if (entry.is_dir && entry.children) {
        flattenFileTree(entry.children, result);
      }
    }
    return result;
  }, []);

  // 获取所有文件
  const allFiles = useMemo(() => flattenFileTree(fileTree), [fileTree, flattenFileTree]);

  // 文件选择器过滤
  const pickerFilteredFiles = useMemo(() => {
    if (!filePickerQuery) {
      return allFiles.filter(f => !f.isFolder).slice(0, 20);
    }
    const query = filePickerQuery.toLowerCase();
    return allFiles
      .filter(f => !f.isFolder && f.name.toLowerCase().includes(query))
      .slice(0, 20);
  }, [allFiles, filePickerQuery]);

  // 判断是否有对话历史（用于控制动画状态）
  // Chat 模式下，流式进行中也算已开始（确保流式消息能正确显示）
  const hasStarted = chatMode === "agent"
    ? agentMessages.length > 0
    : chatMessages.length > 0 || chatStreaming;

  // 获取当前消息列表
  const messages = chatMode === "agent" ? agentMessages : chatMessages;

  // 判断是否正在加载
  const isLoading = chatMode === "agent"
    ? agentStatus === "running"
    : chatLoading || chatStreaming;

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 首次加载检查
  useEffect(() => {
    if (chatMode === "agent") {
      checkAgentFirstLoad();
    } else {
      checkChatFirstLoad();
    }
  }, [chatMode, checkAgentFirstLoad, checkChatFirstLoad]);

  // 点击外部关闭文件选择器
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-file-picker]')) {
        setShowFilePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 检测输入是否仅仅是一个网页链接
  const isOnlyWebLink = useCallback((text: string): string | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    
    // 检查是否包含空格（多个单词则不是链接）
    if (trimmed.includes(' ')) return null;
    
    let url = trimmed;
    
    // 情况1: 已经是完整的 URL (http:// 或 https://)
    if (/^https?:\/\//.test(url)) {
      return url;
    }
    
    // 情况2: www. 开头
    if (/^www\./.test(url)) {
      return 'https://' + url;
    }
    
    // 情况3: 域名格式 (例如 baidu.com, google.com, example.co.uk)
    // 支持带路径的 URL (例如 baidu.com/search?q=test)
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+/.test(url)) {
      return 'https://' + url;
    }
    
    return null;
  }, []);

  // 发送消息
  const handleSend = useCallback(async () => {
    if ((!input.trim() && referencedFiles.length === 0) || isLoading) return;

    // 检查是否仅仅是一个网页链接
    const webLink = isOnlyWebLink(input);
    if (webLink && referencedFiles.length === 0) {
      // 直接打开网页链接
      const { openWebpageTab } = useFileStore.getState();
      openWebpageTab(webLink);
      setInput("");
      return;
    }

    const message = input;
    setInput("");
    const files = [...referencedFiles];
    setReferencedFiles([]);

    const { displayMessage, fullMessage } = await processMessageWithFiles(message, files);

    if (chatMode === "agent") {
      await startTask(fullMessage, {
        workspacePath: vaultPath || "",
        activeNote: currentFile || undefined,
        activeNoteContent: currentFile ? currentContent : undefined,
        displayMessage,
      });
    } else {
      const currentFileInfo = currentFile ? {
        path: currentFile,
        name: currentFile.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "",
        content: currentContent,
      } : undefined;
      await sendMessageStream(fullMessage, currentFileInfo, displayMessage);
    }
  }, [input, chatMode, isLoading, vaultPath, currentFile, currentContent, referencedFiles, startTask, sendMessageStream, isOnlyWebLink]);

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 停止生成
  const handleStop = useCallback(() => {
    if (chatMode === "agent") {
      agentAbort();
    } else {
      stopStreaming();
    }
  }, [chatMode, agentAbort, stopStreaming]);

  // 获取快捷操作列表
  const quickActions = useMemo(() => getQuickActions(t), [t]);

  // 快捷操作点击
  const handleQuickAction = (action: typeof quickActions[0]) => {
    setChatMode(action.mode);
    if (action.prompt) {
      setInput(action.prompt);
    }
  };

  // 从消息历史中提取创建/编辑的文件
  const extractCreatedFiles = useCallback((): string[] => {
    if (chatMode !== "agent") return [];

    const files: string[] = [];
    for (const msg of messages) {
      const content = getTextFromContent(msg.content);
      if (msg.role === "user" && content.includes("<tool_result")) {
        // 匹配 create_note 的结果: "已创建文件: xxx.md" 或 "已覆盖文件: xxx.md"
        const createMatch = content.match(/<tool_result name="create_note">\s*已(?:创建|覆盖)文件: ([^\n<]+)/);
        if (createMatch) {
          files.push(createMatch[1].trim());
        }
        // 匹配 edit_note 的结果: "文件: xxx.md\n已生成 N 处修改"
        const editMatch = content.match(/<tool_result name="edit_note">\s*文件: ([^\n<]+)/);
        if (editMatch) {
          files.push(editMatch[1].trim());
        }
      }
    }
    return [...new Set(files)]; // 去重
  }, [messages, chatMode]);

  // 新建对话
  const handleNewChat = () => {
    createSession();
    setShowHistory(false);
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  return (
    <div className="h-full bg-background text-foreground flex flex-col overflow-hidden relative">
      {/* 顶部工具栏 */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors ${showHistory
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
          >
            <History size={14} />
            <span>{t.ai.historyChats}</span>
          </button>
          <span className="ml-3 text-[11px] text-muted-foreground select-none">
            {t.ai.sessionTokens}: {chatMode === "agent" ? agentTotalTokens : chatTotalTokens}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus size={14} />
            <span>{t.ai.newChat}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* 历史对话侧边栏 - 覆盖式，不影响内容居中 */}
        <AnimatePresence>
          {showHistory && (
            <>
              {/* 遮罩层 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/20 z-30"
                onClick={() => setShowHistory(false)}
              />
              {/* 侧边栏 */}
              <motion.div
                initial={{ x: -240, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -240, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute left-0 top-0 h-full w-60 border-r border-border bg-background shadow-lg z-40 flex flex-col"
              >
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {chatMode === "agent" ? t.ai.agentChats : t.ai.chatChats}
                  </h3>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground text-center">
                      {t.ai.noHistory}
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <div
                        key={session.id}
                        className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${session.id === currentSessionId
                            ? "bg-muted"
                            : "hover:bg-muted/50"
                          }`}
                        onClick={() => {
                          switchSession(session.id);
                          setShowHistory(false);
                        }}
                      >
                        <MessageSquare size={14} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{session.title}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatTime(session.updatedAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                          title={t.common.delete}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* 主要内容区域 - 始终居中 */}
        <main className={`h-full w-full flex flex-col transition-all duration-700 ease-out overflow-hidden ${hasStarted ? "" : "justify-center items-center"
          }`}>

          {/* 欢迎语与头像 - 仅在未开始时显示 */}
          <AnimatePresence>
            {!hasStarted && (
              <motion.div
                className="text-center mb-8 space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, scale: 0.9, transition: { duration: 0.3 } }}
              >
                {/* 头像/Emoji */}
                <div className="w-20 h-20 bg-background rounded-full mx-auto shadow-sm border border-border flex items-center justify-center">
                  <span className="text-4xl">{welcomeEmoji}</span>
                </div>

                <h1 className="text-3xl font-bold text-foreground tracking-tight">
                  {t.ai.welcomeTitle}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {t.ai.welcomeSubtitle}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 消息列表区域 (对话模式) */}
          {hasStarted && (
            <div className="flex-1 w-full overflow-y-auto scrollbar-thin">
              <div className="max-w-3xl mx-auto px-4 pt-8">

                {/* Agent 模式：使用 AgentMessageRenderer 组件 */}
                {chatMode === "agent" ? (
                  <AgentMessageRenderer
                    messages={agentMessages}
                    isRunning={agentStatus === "running"}
                    llmRequestStartTime={llmRequestStartTime}
                    onRetryTimeout={() => retryTimeout({
                      workspacePath: vaultPath || "",
                      activeNote: currentFile || undefined,
                      activeNoteContent: currentFile ? currentContent : undefined,
                    })}
                  />
                ) : (
                  /* Chat 模式：原有的消息渲染 */
                  chatMessages.map((msg, idx) => {
                    const isUser = msg.role === "user";
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mb-6 flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        {!isUser && (
                          <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                            <Bot size={16} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className={`max-w-[80%] ${isUser
                            ? "bg-muted text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5"
                            : "text-foreground"
                          }`}>
                          {isUser ? (
                            <span className="text-sm">{getTextFromContent(msg.content)}</span>
                          ) : (
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: parseMarkdown(getTextFromContent(msg.content)) }}
                            />
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}

                {/* 创建/编辑的文件链接 */}
                {chatMode === "agent" && agentStatus !== "running" && (() => {
                  const createdFiles = extractCreatedFiles();
                  if (createdFiles.length === 0) return null;

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 flex gap-3"
                    >
                      <div className="w-8 h-8 shrink-0" /> {/* 占位，对齐 Bot 头像 */}
                      <div className="flex flex-wrap gap-2">
                        {createdFiles.map((file) => (
                          <button
                            key={file}
                            onClick={() => openFile(join(vaultPath || "", file))}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors border border-primary/20"
                          >
                            <FileText size={14} />
                            <span>{file}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  );
                })()}

                {/* 工具审批 */}
                {chatMode === "agent" && pendingTool && agentStatus === "waiting_approval" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 max-w-[80%]"
                  >
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="font-medium text-sm">{t.ai.needApproval}</span>
                      </div>
                      <div className="text-sm text-foreground mb-3">
                        <p className="mb-1">
                          {t.ai.tool}: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{pendingTool.name}</code>
                        </p>
                        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
                          {JSON.stringify(pendingTool.params, null, 2)}
                        </pre>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={approve}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          {t.ai.approve}
                        </button>
                        <button
                          onClick={reject}
                          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-lg transition-colors"
                        >
                          <X className="w-3 h-3" />
                          {t.ai.reject}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 打字指示器 - 仅 Agent 模式使用，Chat 模式使用 TypingIndicator 组件 */}
                {chatMode === "agent" && isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3 mb-6"
                  >
                    <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                      <Bot size={16} className="text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-1 h-8">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  </motion.div>
                )}

                {/* Chat 模式的流式消息 - 直接渲染在消息列表中，使用相同样式 */}
                {chatMode === "chat" && chatStreaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 mb-6"
                  >
                    <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                      <Bot size={16} className="text-muted-foreground" />
                    </div>
                    <div className="max-w-[80%] text-foreground">
                      {streamingContent ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                          <span dangerouslySetInnerHTML={{ __html: parseMarkdown(streamingContent) }} />
                          {/* 闪烁光标 */}
                          <span
                            className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle animate-pulse"
                            style={{ animationDuration: '1s' }}
                          />
                        </div>
                      ) : (
                        /* 等待首个 token 时的打字指示器 */
                        <div className="flex items-center gap-1 h-6">
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* 输入框容器 */}
          <div className={`w-full shrink-0 ${hasStarted ? "pb-4" : ""}`}>
            <motion.div
              layout
              transition={{ type: "spring", bounce: 0, duration: 0.6 }}
              className="w-full max-w-3xl mx-auto px-4"
            >
              <motion.div
                layout="position"
                className={`bg-background rounded-[24px] shadow-lg border border-border transition-shadow duration-300 ${hasStarted ? "shadow-md" : "shadow-xl"
                  }`}
              >
                {/* 输入文本区域 */}
                <div className="p-4 pb-2">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={chatMode === "agent" ? t.ai.agentInputPlaceholder : t.ai.chatInputPlaceholder}
                    className="w-full resize-none outline-none text-foreground placeholder:text-muted-foreground min-h-[40px] max-h-[200px] bg-transparent text-base leading-relaxed"
                    rows={1}
                    autoFocus
                  />
                </div>

                {/* 已引用的文件标签 */}
                {referencedFiles.length > 0 && (
                  <div className="px-4 pt-2 flex flex-wrap gap-1">
                    {referencedFiles.map(file => (
                      <div
                        key={file.path}
                        className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs"
                      >
                        <FileText size={12} />
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <button
                          onClick={() => setReferencedFiles(files => files.filter(f => f.path !== file.path))}
                          className="hover:bg-primary/20 rounded p-0.5"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 底部工具栏 */}
                <div className="px-4 pb-3 pt-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* 附件按钮 - 工作区文件选择器 */}
                    <div className="relative" data-file-picker>
                      <button
                        onClick={() => setShowFilePicker(!showFilePicker)}
                        className="flex items-center gap-1.5 p-1.5 px-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={t.ai.addWorkspaceFile}
                      >
                        <Paperclip size={16} />
                      </button>

                      {/* 文件选择下拉菜单 */}
                      {showFilePicker && (
                        <div className="absolute bottom-full left-0 mb-1 w-72 bg-background border border-border rounded-lg shadow-lg z-50">
                          <div className="p-2 border-b border-border">
                            <input
                              type="text"
                              value={filePickerQuery}
                              onChange={(e) => setFilePickerQuery(e.target.value)}
                              placeholder={t.ai.searchFile}
                              className="w-full px-2 py-1.5 text-sm bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-primary/50"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {pickerFilteredFiles.length === 0 ? (
                              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                                {t.ai.fileNotFound}
                              </div>
                            ) : (
                              pickerFilteredFiles.map((file) => (
                                <button
                                  key={file.path}
                                  onClick={() => {
                                    if (!referencedFiles.some(f => f.path === file.path)) {
                                      setReferencedFiles([...referencedFiles, file]);
                                    }
                                    setShowFilePicker(false);
                                    setFilePickerQuery("");
                                  }}
                                  className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors"
                                >
                                  {file.isFolder ? (
                                    <Folder size={14} className="text-yellow-500 shrink-0" />
                                  ) : (
                                    <FileText size={14} className="text-slate-500 shrink-0" />
                                  )}
                                  <span className="truncate">{file.name}</span>
                                </button>
                              ))
                            )}
                          </div>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                            {t.ai.filesCount.replace('{count}', String(allFiles.filter(f => !f.isFolder).length))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Agent/Chat 切换滑块 */}
                    <div className="flex items-center bg-muted rounded-lg p-0.5">
                      <button
                        onClick={() => setChatMode("chat")}
                        title={t.ai.chatModeHint}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${chatMode === "chat"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        <span className="flex items-center gap-1">
                          <Sparkles size={12} />
                          Chat
                        </span>
                      </button>
                      <button
                        onClick={() => setChatMode("agent")}
                        title={t.ai.agentModeHint}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${chatMode === "agent"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        <span className="flex items-center gap-1">
                          <Bot size={12} />
                          Agent
                        </span>
                      </button>
                    </div>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {config.apiKey ? "✓" : t.ai.notConfigured}
                    </span>

                    {/* 设置按钮：紧挨着模式切换的小齿轮，打开 AI 对话设置 */}
                    <button
                      onClick={() => setShowSettings(true)}
                      className="ml-1 flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={t.ai.aiChatSettings}
                    >
                      <Settings size={14} />
                    </button>

                    {/* 语音识别中间结果 */}
                    {interimText && (
                      <span className="text-xs text-muted-foreground italic animate-pulse truncate max-w-[200px]">
                        {interimText}...
                      </span>
                    )}
                  </div>

                  {/* 右侧按钮组 */}
                  <div className="flex items-center gap-1">
                    {/* 麦克风按钮 */}
                    <button
                      onClick={toggleRecording}
                      className={`p-2 rounded-full transition-all duration-200 ${isRecording
                          ? "bg-red-500/20 text-red-500"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      title={isRecording ? t.ai.stopVoice : t.ai.startVoice}
                    >
                      {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>

                    {/* 发送/停止按钮 */}
                    <button
                      onClick={() => isLoading ? handleStop() : handleSend()}
                      disabled={!input.trim() && !isLoading}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${isLoading
                          ? "bg-red-500 text-white hover:bg-red-600"
                          : input.trim()
                            ? "bg-foreground text-background hover:opacity-80 shadow-md"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        }`}
                    >
                      {isLoading ? (
                        <Square size={12} fill="currentColor" />
                      ) : (
                        <ArrowUp size={16} strokeWidth={3} />
                      )}
                    </button>
                  </div>
                </div>

                {/* 应用集成栏 - 仅在未开始时显示 */}
                <AnimatePresence>
                  {!hasStarted && (
                    <motion.div
                      initial={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-muted/30 border-t border-border px-4 py-2.5 text-xs text-muted-foreground overflow-hidden"
                    >
                      <span>{t.ai.getRealtimeContent}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* AI 对话设置面板：使用悬浮窗口 */}
                <AISettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

                {/* 底部说明文字 (仅对话模式) */}
                {hasStarted && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: 0.5 } }}
                    className="text-center text-xs text-muted-foreground mt-3"
                  >
                    {t.ai.aiGeneratedWarning}
                  </motion.p>
                )}
              </motion.div>
            </motion.div>
          </div>

          {/* 建议卡片区域 - 仅在未开始时显示 */}
          <AnimatePresence>
            {!hasStarted && (
              <motion.div
                className="w-full max-w-3xl mx-auto px-4 mt-10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
                exit={{ opacity: 0, y: 50, pointerEvents: "none", transition: { duration: 0.2 } }}
              >
                <div className="mb-4 px-1">
                  <span className="text-xs font-medium text-muted-foreground">{t.ai.startTask}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {quickActions.map((action, idx) => (
                    <SuggestionCard
                      key={idx}
                      icon={action.icon}
                      title={action.label}
                      desc={action.desc}
                      onClick={() => handleQuickAction(action)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* 调试按钮 */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg hover:bg-orange-600 transition-colors text-xs font-bold"
          title={t.ai.debugPanel}
        >
          🐛
        </button>

        {/* 调试面板 */}
        {showDebug && (() => {
          // 获取完整消息（包含 system prompt）
          const fullMessages = getAgentLoop().getState().messages;

          return (
            <div className="fixed inset-4 z-50 bg-background/95 backdrop-blur border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                <h2 className="font-bold text-lg">🐛 {t.ai.agentDebugPanel}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t.ai.mode}: {chatMode} | {t.ai.status}: {agentStatus} | {t.ai.fullMsgsCount}: {fullMessages.length} | {t.ai.displayMsgsCount}: {agentMessages.length}
                  </span>
                  <button
                    onClick={() => setShowDebug(false)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-4">
                {/* 意图识别调试信息 */}
                <div className="p-3 rounded-lg border bg-muted/30 border-border mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-muted-foreground flex items-center gap-2">
                      <span>🔍 {t.ai.intentResult}</span>
                      {lastIntent && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${lastIntent.confidence > 0.8 ? 'bg-green-500/20 text-green-600' : 'bg-amber-500/20 text-amber-600'
                          }`}>
                          {(lastIntent.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {!lastIntent && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {t.ai.notTriggered}
                      </span>
                    )}
                  </div>

                  {lastIntent ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-16 shrink-0">Type:</span>
                        <span className="font-bold text-foreground bg-background px-1 rounded border border-border/50">
                          {lastIntent.type}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-16 shrink-0">Reason:</span>
                        <span className="text-foreground/80 italic break-words">
                          {lastIntent.reasoning}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground italic opacity-70">
                      暂无意图数据。可能原因：
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>尚未发送消息</li>
                        <li>未在设置中启用"动态路由" (Routing)</li>
                        <li>路由配置不完整</li>
                      </ul>
                    </div>
                  )}
                </div>

                {fullMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${msg.role === "system"
                        ? "bg-purple-500/10 border-purple-500/30"
                        : msg.role === "user"
                          ? "bg-blue-500/10 border-blue-500/30"
                          : "bg-green-500/10 border-green-500/30"
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-2 font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${msg.role === "system"
                          ? "bg-purple-500 text-white"
                          : msg.role === "user"
                            ? "bg-blue-500 text-white"
                            : "bg-green-500 text-white"
                        }`}>
                        {msg.role.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground">#{idx}</span>
                      <span className="text-muted-foreground">
                        {getTextFromContent(msg.content).length} chars
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-foreground/90 max-h-[600px] overflow-auto">
                      {getTextFromContent(msg.content)}
                    </pre>
                  </div>
                ))}
                {fullMessages.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    {t.ai.noMsgs}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
}
