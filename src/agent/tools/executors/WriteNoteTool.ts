/**
 * write_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { writeFile, exists, createDir } from "@/lib/tauri";
import { join, dirname } from "@/lib/path";

export const WriteNoteTool: ToolExecutor = {
  name: "write_note",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;
    const content = params.content as string;

    if (!path) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 path 参数",
      };
    }

    if (content === undefined) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 content 参数",
      };
    }

    try {
      const fullPath = join(context.workspacePath, path);
      const dir = dirname(fullPath);

      // 确保目录存在
      if (!(await exists(dir))) {
        await createDir(dir, { recursive: true });
      }

      const fileExisted = await exists(fullPath);

      // 写入文件
      await writeFile(fullPath, content);

      return {
        success: true,
        content: fileExisted
          ? `已覆盖文件: ${path}`
          : `已创建文件: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `写入文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
