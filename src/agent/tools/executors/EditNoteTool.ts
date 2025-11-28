/**
 * edit_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile, writeFile } from "@/lib/tauri";
import { join } from "@/lib/path";

interface EditOperation {
  search: string;
  replace: string;
}

export const EditNoteTool: ToolExecutor = {
  name: "edit_note",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;
    const edits = params.edits as EditOperation[];

    if (!path) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 path 参数",
      };
    }

    if (!Array.isArray(edits) || edits.length === 0) {
      return {
        success: false,
        content: "",
        error: "参数错误: edits 必须是非空数组",
      };
    }

    try {
      const fullPath = join(context.workspacePath, path);
      let content = await readFile(fullPath);

      const appliedEdits: string[] = [];
      const failedEdits: string[] = [];

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        if (!edit.search || edit.replace === undefined) {
          failedEdits.push(`编辑 ${i + 1}: 缺少 search 或 replace`);
          continue;
        }

        // 尝试精确匹配
        if (content.includes(edit.search)) {
          content = content.replace(edit.search, edit.replace);
          appliedEdits.push(`编辑 ${i + 1}: 成功`);
        } else {
          // 尝试规范化空白后匹配
          const normalizedContent = content.replace(/\r\n/g, "\n");
          const normalizedSearch = edit.search.replace(/\r\n/g, "\n");

          if (normalizedContent.includes(normalizedSearch)) {
            content = normalizedContent.replace(normalizedSearch, edit.replace);
            appliedEdits.push(`编辑 ${i + 1}: 成功 (规范化匹配)`);
          } else {
            failedEdits.push(
              `编辑 ${i + 1}: 未找到匹配内容。请确保 search 内容与文件完全一致。`
            );
          }
        }
      }

      if (appliedEdits.length > 0) {
        // 写入文件
        await writeFile(fullPath, content);

        const summary = [
          `文件: ${path}`,
          `成功应用: ${appliedEdits.length} 处修改`,
          ...appliedEdits,
        ];

        if (failedEdits.length > 0) {
          summary.push(`失败: ${failedEdits.length} 处`, ...failedEdits);
        }

        return {
          success: true,
          content: summary.join("\n"),
        };
      } else {
        return {
          success: false,
          content: "",
          error: `所有编辑都失败了:\n${failedEdits.join("\n")}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `编辑文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
