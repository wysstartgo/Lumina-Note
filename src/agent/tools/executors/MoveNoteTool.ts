/**
 * move_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { exists, rename, createDir } from "@/lib/tauri";
import { join, dirname } from "@/lib/path";

export const MoveNoteTool: ToolExecutor = {
  name: "move_note",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const from = params.from as string;
    const to = params.to as string;

    if (!from) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 from 参数",
      };
    }

    if (!to) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 to 参数",
      };
    }

    try {
      const fromPath = join(context.workspacePath, from);
      const toPath = join(context.workspacePath, to);

      // 检查源文件是否存在
      if (!(await exists(fromPath))) {
        return {
          success: false,
          content: "",
          error: `源文件不存在: ${from}`,
        };
      }

      // 检查目标文件是否已存在
      if (await exists(toPath)) {
        return {
          success: false,
          content: "",
          error: `目标文件已存在: ${to}`,
        };
      }

      // 确保目标目录存在
      const toDir = dirname(toPath);
      if (!(await exists(toDir))) {
        await createDir(toDir, { recursive: true });
      }

      // 执行移动
      await rename(fromPath, toPath);

      return {
        success: true,
        content: `已移动: ${from} -> ${to}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `移动文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
