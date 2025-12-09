/**
 * 工具执行器本地化消息
 * 提供统一的错误消息和成功消息获取方法
 */

import { getCurrentTranslations } from "@/stores/useLocaleStore";

type ToolResultMessages = ReturnType<typeof getCurrentTranslations>["prompts"]["toolResults"];

/**
 * 获取本地化的工具结果消息
 */
export function getToolMessages(): ToolResultMessages {
  return getCurrentTranslations().prompts.toolResults;
}

/**
 * 格式化消息模板（替换 {key} 占位符）
 */
export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

// 常用错误消息快捷方法
export const toolMsg = {
  pathRequired: () => getToolMessages().common.pathRequired,
  invalidParams: () => getToolMessages().common.invalidParams,
  fileNotFound: (path: string) => formatMessage(getToolMessages().common.fileNotFound, { path }),
  success: () => getToolMessages().common.success,
  failed: () => getToolMessages().common.failed,
  
  // 特定工具消息
  readNote: {
    success: (path: string) => formatMessage(getToolMessages().readNote.success, { path }),
    lines: (count: number) => formatMessage(getToolMessages().readNote.lines, { count }),
  },
  editNote: {
    success: (path: string) => formatMessage(getToolMessages().editNote.success, { path }),
    renamed: (newName: string) => formatMessage(getToolMessages().editNote.renamed, { newName }),
    searchNotFound: () => getToolMessages().editNote.searchNotFound,
    newNameInvalid: () => getToolMessages().editNote.newNameInvalid,
    editsRequired: () => getToolMessages().editNote.editsRequired,
  },
  createNote: {
    success: (path: string) => formatMessage(getToolMessages().createNote.success, { path }),
    alreadyExists: () => getToolMessages().createNote.alreadyExists,
  },
  deleteNote: {
    success: (path: string) => formatMessage(getToolMessages().deleteNote.success, { path }),
  },
  moveFile: {
    success: (from: string, to: string) => formatMessage(getToolMessages().moveFile.success, { from, to }),
    targetExists: () => getToolMessages().moveFile.targetExists,
  },
  renameFile: {
    success: (oldName: string, newName: string) => formatMessage(getToolMessages().renameFile.success, { oldName, newName }),
    targetExists: () => getToolMessages().renameFile.targetExists,
  },
  createFolder: {
    success: (path: string) => formatMessage(getToolMessages().createFolder.success, { path }),
    alreadyExists: () => getToolMessages().createFolder.alreadyExists,
  },
  search: {
    found: (count: number) => formatMessage(getToolMessages().search.found, { count }),
    noResults: () => getToolMessages().search.noResults,
  },
  database: {
    rowAdded: () => getToolMessages().database.rowAdded,
    columnNotFound: (column: string) => formatMessage(getToolMessages().database.columnNotFound, { column }),
    invalidValue: (value: string) => formatMessage(getToolMessages().database.invalidValue, { value }),
  },
  flashcard: {
    created: () => getToolMessages().flashcard.created,
    invalidType: () => getToolMessages().flashcard.invalidType,
  },
};
