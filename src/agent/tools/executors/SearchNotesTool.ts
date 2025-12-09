/**
 * search_notes 工具执行器
 * 基于 RAG 的语义搜索
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { useRAGStore } from "@/stores/useRAGStore";
import type { SearchResult } from "@/services/rag";
import { toolMsg } from "./messages";

export const SearchNotesTool: ToolExecutor = {
  name: "search_notes",
  requiresApproval: false, // 只读操作，不需要审批

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const query = params.query as string;
    const directory = params.directory as string | undefined;
    const limit = (params.limit as number) || 10;

    if (!query || typeof query !== "string") {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: query required`,
      };
    }

    try {
      // 获取 RAG 管理器
      const ragManager = useRAGStore.getState().ragManager;

      if (!ragManager || !ragManager.isInitialized()) {
        return {
          success: false,
          content: "",
          error: "RAG system not initialized. Please configure embedding API in settings.",
        };
      }

      // 执行语义搜索
      const results = await ragManager.search(query, {
        limit,
        directory,
      });

      if (results.length === 0) {
        return {
          success: true,
          content: toolMsg.search.noResults(),
        };
      }

      // 格式化结果
      const formattedResults = results.map((r: SearchResult, i: number) => {
        const score = (r.score * 100).toFixed(1);
        const preview = r.content.length > 300 
          ? r.content.substring(0, 300) + "..." 
          : r.content;
        
        return `### ${i + 1}. ${r.filePath} (relevance: ${score}%)
**Section**: ${r.heading}
**Location**: line ${r.startLine}-${r.endLine}

\`\`\`
${preview}
\`\`\``;
      }).join("\n\n---\n\n");

      return {
        success: true,
        content: `${toolMsg.search.found(results.length)}\n\n${formattedResults}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.failed()}: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  },
};
