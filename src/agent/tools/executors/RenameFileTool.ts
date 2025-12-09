/**
 * rename_file 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { exists, rename } from "@/lib/tauri";
import { join, dirname, resolve } from "@/lib/path";
import { useFileStore } from "@/stores/useFileStore";
import { toolMsg } from "./messages";

export const RenameFileTool: ToolExecutor = {
  name: "rename_file",
  requiresApproval: true,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;
    const newName = params.new_name as string;

    if (!path || !newName) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: path and new_name required

Usage:
<rename_file>
<path>path/old-name.ext</path>
<new_name>new-name.ext</new_name>
</rename_file>`,
      };
    }

    if (newName.includes("/") || newName.includes("\\")) {
      return {
        success: false,
        content: "",
        error: toolMsg.editNote.newNameInvalid(),
      };
    }

    try {
      const fullPath = resolve(context.workspacePath, path);
      const fullDir = dirname(fullPath);
      const newFullPath = join(fullDir, newName);

      // 检查源文件是否存在
      if (!(await exists(fullPath))) {
        return {
          success: false,
          content: "",
          error: toolMsg.fileNotFound(path),
        };
      }

      // 检查目标文件是否已存在
      if (await exists(newFullPath)) {
        return {
          success: false,
          content: "",
          error: toolMsg.renameFile.targetExists(),
        };
      }

      // 执行重命名
      await rename(fullPath, newFullPath);
      
      // 计算新路径（相对路径）
      const relativeDir = dirname(path);
      const newPath = relativeDir ? `${relativeDir}/${newName}` : newName;
      
      // 更新标签页中的路径和名称
      useFileStore.getState().updateTabPath(path, newPath);

      // 延迟刷新文件树，避免在 Agent 运行时触发 UI 重渲染
      setTimeout(() => {
        useFileStore.getState().refreshFileTree();
      }, 100);

      return {
        success: true,
        content: toolMsg.renameFile.success(path, newName),
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
