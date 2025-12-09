/**
 * semantic_search 工具执行器
 * 基于 RAG 系统的语义搜索
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { useRAGStore } from "@/stores/useRAGStore";
import type { SearchResult } from "@/services/rag";
import { toolMsg } from "./messages";

export const SemanticSearchTool: ToolExecutor = {
  name: "semantic_search",
  requiresApproval: false, // 只读操作

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const query = params.query as string;
    const directory = params.directory as string | undefined;
    const limit = (params.limit as number) || 10;
    const minScore = (params.min_score as number) || 0.3;

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

      // 过滤低分结果
      const filteredResults = results.filter(
        (r: SearchResult) => r.score >= minScore
      );

      if (filteredResults.length === 0) {
        return {
          success: true,
          content: `${toolMsg.search.noResults()} (min_score: ${minScore * 100}%)`,
        };
      }

      // 格式化结果
      const formattedResults = filteredResults
        .map((r: SearchResult, i: number) => {
          const score = (r.score * 100).toFixed(1);
          const preview =
            r.content.length > 400
              ? r.content.substring(0, 400) + "..."
              : r.content;

          return `### ${i + 1}. ${r.filePath} (similarity: ${score}%)
**Section**: ${r.heading || "untitled"}
**Location**: line ${r.startLine}-${r.endLine}

\`\`\`
${preview}
\`\`\``;
        })
        .join("\n\n---\n\n");

      return {
        success: true,
        content: `${toolMsg.search.found(filteredResults.length)}\n\n${formattedResults}`,
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
