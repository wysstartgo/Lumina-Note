/**
 * read_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile } from "@/lib/tauri";
import { join } from "@/lib/path";

export const ReadNoteTool: ToolExecutor = {
  name: "read_note",
  requiresApproval: false, // 只读操作，不需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const paths = params.paths as string[];

    if (!Array.isArray(paths) || paths.length === 0) {
      return {
        success: false,
        content: "",
        error: "参数错误: paths 必须是非空数组",
      };
    }

    const results: string[] = [];

    for (const relativePath of paths) {
      try {
        const fullPath = join(context.workspacePath, relativePath);
        const content = await readFile(fullPath);

        // 添加行号
        const lines = content.split("\n");
        const numberedContent = lines
          .map((line, index) => `${index + 1} | ${line}`)
          .join("\n");

        results.push(`=== ${relativePath} ===\n${numberedContent}\n=== END ===`);
      } catch (error) {
        results.push(
          `=== ${relativePath} ===\n错误: ${error instanceof Error ? error.message : "无法读取文件"}\n=== END ===`
        );
      }
    }

    return {
      success: true,
      content: results.join("\n\n"),
    };
  },
};
