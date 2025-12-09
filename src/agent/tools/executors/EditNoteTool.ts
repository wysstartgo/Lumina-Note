/**
 * edit_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile, rename, exists } from "@/lib/tauri";
import { join, resolve, dirname } from "@/lib/path";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { toolMsg } from "./messages";

interface EditOperation {
  search: string;
  replace: string;
}

export const EditNoteTool: ToolExecutor = {
  name: "edit_note",
  requiresApproval: false, // 通过 DiffView 确认，不需要单独审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;
    const newName = params.new_name as string | undefined;

    // 验证 new_name 参数
    if (newName) {
      if (newName.includes("/") || newName.includes("\\")) {
        return {
          success: false,
          content: "",
          error: toolMsg.editNote.newNameInvalid(),
        };
      }
    }

    // 兼容多种参数格式
    let edits: EditOperation[] = [];

    if (Array.isArray(params.edits) && params.edits.length > 0) {
      // 标准格式: edits: [{search, replace}]
      edits = params.edits as EditOperation[];
    } else if (params.search && params.replace !== undefined) {
      // 兼容格式1: search + replace 作为独立参数
      edits = [{ search: params.search as string, replace: params.replace as string }];
      console.log("[EditNoteTool] 参数兼容: search/replace → edits[]");
    } else if (params.old_text && params.new_text !== undefined) {
      // 兼容格式2: old_text + new_text
      edits = [{ search: params.old_text as string, replace: params.new_text as string }];
      console.log("[EditNoteTool] 参数兼容: old_text/new_text → edits[]");
    } else if (params.find && params.replace !== undefined) {
      // 兼容格式3: find + replace
      edits = [{ search: params.find as string, replace: params.replace as string }];
      console.log("[EditNoteTool] 参数兼容: find/replace → edits[]");
    } else if (params.content && typeof params.content === "string") {
      // 兼容格式4: 直接给 content（追加模式，需要先读取原内容）
      // 这种情况需要特殊处理，暂时返回错误提示
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: edit_note requires search/replace pairs`,
      };
    }

    if (!path) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.pathRequired()}

Usage:
<edit_note>
<path>note-path.md</path>
<edits>[{"search": "original", "replace": "new"}]</edits>
</edit_note>`,
      };
    }

    if (edits.length === 0) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.editNote.editsRequired()}

Usage:
<edit_note>
<path>${path}</path>
<edits>[{"search": "original", "replace": "new"}]</edits>
</edit_note>`,
      };
    }

    try {
      const fullPath = resolve(context.workspacePath, path);
      let content = await readFile(fullPath);

      // 保存原始内容用于实时预览
      const oldContent = content;

      const appliedEdits: string[] = [];
      const failedEdits: string[] = [];

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        if (!edit.search || edit.replace === undefined) {
          failedEdits.push(`Edit ${i + 1}: missing search or replace`);
          continue;
        }

        // 尝试精确匹配
        if (content.includes(edit.search)) {
          content = content.replace(edit.search, edit.replace);
          appliedEdits.push(`Edit ${i + 1}: ${toolMsg.success()}`);
        } else {
          // 尝试规范化空白后匹配
          const normalizedContent = content.replace(/\r\n/g, "\n");
          const normalizedSearch = edit.search.replace(/\r\n/g, "\n");

          if (normalizedContent.includes(normalizedSearch)) {
            content = normalizedContent.replace(normalizedSearch, edit.replace);
            appliedEdits.push(`Edit ${i + 1}: ${toolMsg.success()} (normalized)`);
          } else {
            // 提供更有用的错误信息
            const searchPreview = edit.search.length > 50
              ? edit.search.substring(0, 50) + "..."
              : edit.search;
            failedEdits.push(
              `Edit ${i + 1}: ${toolMsg.editNote.searchNotFound()} "${searchPreview}"`
            );
          }
        }
      }

      if (appliedEdits.length > 0) {
        // 不直接写入文件，通过 DiffView 让用户确认
        const fileName = path.split(/[/\\]/).pop() || path;

        // 设置 pendingDiff，复用 Chat 模式的 DiffView
        const { setPendingDiff, setDiffResolver } = useAIStore.getState();

        // 创建 Promise 等待用户确认
        const confirmation = new Promise<boolean>((resolve) => {
          setDiffResolver(resolve);
        });

        setPendingDiff({
          fileName,
          filePath: fullPath,
          original: oldContent,
          modified: content,
          description: `Agent edit: ${appliedEdits.length} changes`,
        });

        // 等待用户确认
        const approved = await confirmation;

        // 清理 resolver
        setDiffResolver(null);

        if (approved) {
          const summary = [
            `File: ${path}`,
            `Generated ${appliedEdits.length} edits, user confirmed.`,
            ...appliedEdits,
          ];

          if (failedEdits.length > 0) {
            summary.push(`${toolMsg.failed()}: ${failedEdits.length}`, ...failedEdits);
          }

          // 如果提供了 new_name，执行重命名
          if (newName) {
            try {
              const dir = dirname(fullPath);
              const newFullPath = join(dir, newName);

              // 检查目标文件是否已存在
              if (await exists(newFullPath)) {
                summary.push(`\nWarning: rename failed - ${toolMsg.renameFile.targetExists()}`);
              } else {
                // 执行重命名
                await rename(fullPath, newFullPath);
                
                // 计算新路径
                const dir = dirname(path);
                const newPath = dir ? `${dir}/${newName}` : newName;
                
                summary.push(`\n${toolMsg.renameFile.success(path, newName)}`);

                // 更新标签页中的路径和名称
                useFileStore.getState().updateTabPath(path, newPath);
                
                // 延迟刷新文件树
                setTimeout(() => {
                  useFileStore.getState().refreshFileTree();
                }, 100);
              }
            } catch (error) {
              summary.push(`\nWarning: rename failed - ${error instanceof Error ? error.message : "unknown error"}`);
            }
          }

          return {
            success: true,
            content: summary.join("\n"),
          };
        } else {
          return {
            success: false,
            content: "User rejected the changes.",
            error: "User rejected",
          };
        }
      } else {
        return {
          success: false,
          content: "",
          error: `All edits failed:\n${failedEdits.join("\n")}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.failed()}: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  },
};
