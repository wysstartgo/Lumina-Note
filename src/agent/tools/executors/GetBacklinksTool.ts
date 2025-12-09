/**
 * get_backlinks 工具执行器
 * 获取指定笔记的反向链接
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { useNoteIndexStore, Backlink } from "@/stores/useNoteIndexStore";
import { useFileStore } from "@/stores/useFileStore";
import { toolMsg } from "./messages";

export const GetBacklinksTool: ToolExecutor = {
  name: "get_backlinks",
  requiresApproval: false, // 只读操作

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const noteName = params.note_name as string;
    const includeContext = (params.include_context as boolean) ?? true;

    if (!noteName || typeof noteName !== "string") {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: note_name required`,
      };
    }

    try {
      const { getBacklinks, noteIndex, buildIndex } = useNoteIndexStore.getState();
      const { fileTree } = useFileStore.getState();

      // 如果索引为空，先建立索引
      if (noteIndex.size === 0 && fileTree.length > 0) {
        await buildIndex(fileTree);
      }

      // 获取反向链接
      // 尝试多种匹配方式：完整名称、不带 .md 的名称
      const cleanName = noteName.replace(/\.md$/, "");
      let backlinks = getBacklinks(cleanName);

      // 如果没有找到，尝试从路径中提取名称
      if (backlinks.length === 0 && noteName.includes("/")) {
        const baseName = noteName.split("/").pop()?.replace(/\.md$/, "") || "";
        backlinks = getBacklinks(baseName);
      }

      if (backlinks.length === 0) {
        return {
          success: true,
          content: `Note "${cleanName}" has no backlinks.`,
        };
      }

      // 格式化结果
      const formattedResults = backlinks.map((bl: Backlink, i: number) => {
        const contextPart = includeContext && bl.context 
          ? `\n   Context: \`${bl.context.slice(0, 150)}${bl.context.length > 150 ? "..." : ""}\``
          : "";
        return `${i + 1}. **${bl.name}** (line ${bl.line})${contextPart}`;
      }).join("\n\n");

      return {
        success: true,
        content: `Note "${cleanName}" has ${backlinks.length} backlinks:\n\n${formattedResults}`,
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
