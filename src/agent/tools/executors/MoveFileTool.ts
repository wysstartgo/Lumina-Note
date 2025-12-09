/**
 * move_file 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { exists, rename, createDir } from "@/lib/tauri";
import { dirname, resolve } from "@/lib/path";
import { useFileStore } from "@/stores/useFileStore";
import { toolMsg } from "./messages";

export const MoveFileTool: ToolExecutor = {
  name: "move_file",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const from = params.from as string;
    const to = params.to as string;

    if (!from || !to) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: ${!from ? "from" : "to"} required

Usage:
<move_file>
<from>source/file.ext</from>
<to>target/file.ext</to>
</move_file>`,
      };
    }

    try {
      const fromPath = resolve(context.workspacePath, from);
      const toPath = resolve(context.workspacePath, to);

      // 检查源文件是否存在
      if (!(await exists(fromPath))) {
        return {
          success: false,
          content: "",
          error: toolMsg.fileNotFound(from),
        };
      }

      // 检查目标文件是否已存在
      if (await exists(toPath)) {
        return {
          success: false,
          content: "",
          error: toolMsg.moveFile.targetExists(),
        };
      }

      // 确保目标目录存在
      const toDir = dirname(toPath);
      if (!(await exists(toDir))) {
        await createDir(toDir, { recursive: true });
      }

      // 执行移动
      await rename(fromPath, toPath);

      // 延迟刷新文件树，避免在 Agent 运行时触发 UI 重渲染
      setTimeout(() => {
        useFileStore.getState().refreshFileTree();
      }, 100);

      return {
        success: true,
        content: toolMsg.moveFile.success(from, to),
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
