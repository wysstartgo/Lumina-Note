/**
 * create_folder 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { exists, createDir } from "@/lib/tauri";
import { join } from "@/lib/path";
import { useFileStore } from "@/stores/useFileStore";
import { toolMsg } from "./messages";

export const CreateFolderTool: ToolExecutor = {
  name: "create_folder",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;

    if (!path) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.pathRequired()}

Usage:
<create_folder>
<path>folder-path</path>
</create_folder>`,
      };
    }

    try {
      const fullPath = join(context.workspacePath, path);

      // 检查目录是否已存在
      if (await exists(fullPath)) {
        return {
          success: false,
          content: "",
          error: toolMsg.createFolder.alreadyExists(),
        };
      }

      // 创建目录
      await createDir(fullPath, { recursive: true });

      // 延迟刷新文件树，避免在 Agent 运行时触发 UI 重渲染
      setTimeout(() => {
        useFileStore.getState().refreshFileTree();
      }, 100);

      return {
        success: true,
        content: toolMsg.createFolder.success(path),
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
