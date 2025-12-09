/**
 * create_note 工具执行器
 * 创建新的笔记文件
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { writeFile, exists, createDir } from "@/lib/tauri";
import { dirname, resolve } from "@/lib/path";
import { useFileStore } from "@/stores/useFileStore";
import { toolMsg } from "./messages";

export const CreateNoteTool: ToolExecutor = {
  name: "create_note",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    let path = params.path;
    const content = params.content as string;

    // 兼容数组格式 (LLM 有时会输出 ["path"])
    if (Array.isArray(path)) {
      path = path[0];
      console.log("[CreateNoteTool] 参数兼容: path[] → path");
    }

    if (!path || typeof path !== "string") {
      return {
        success: false,
        content: "",
        error: `${toolMsg.pathRequired()}

Usage:
<create_note>
<path>note-path.md</path>
<content>...</content>
</create_note>`,
      };
    }

    if (content === undefined) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: content required

Usage:
<create_note>
<path>${path}</path>
<content># Title

Content...</content>
</create_note>`,
      };
    }

    try {
      const fullPath = resolve(context.workspacePath, path);
      const dir = dirname(fullPath);

      // 确保目录存在
      if (!(await exists(dir))) {
        await createDir(dir, { recursive: true });
      }

      const fileExisted = await exists(fullPath);

      // 写入文件
      await writeFile(fullPath, content);

      // 延迟刷新文件树，避免在 Agent 运行时触发 UI 重渲染
      setTimeout(() => {
        useFileStore.getState().refreshFileTree();
      }, 100);

      return {
        success: true,
        content: fileExisted
          ? `${toolMsg.createNote.alreadyExists()} - overwritten: ${path}`
          : toolMsg.createNote.success(path),
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
