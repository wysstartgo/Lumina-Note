/**
 * Agent 模式定义
 * 支持多语言国际化
 */

import { AgentMode, AgentModeSlug } from "../types";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

// 工具列表配置（不需要翻译）
const MODE_TOOLS: Record<AgentModeSlug, string[]> = {
  editor: [
    "read_note", "edit_note",
    "list_notes", "search_notes", "grep_search", "deep_search",
    "query_database", "add_database_row",
    "generate_flashcards", "create_flashcard",
    "get_backlinks", "read_cached_output"
  ],
  organizer: [
    "read_note", "delete_note", "move_file", "rename_file", "create_folder",
    "list_notes", "search_notes", "grep_search",
    "query_database", "add_database_row",
    "get_backlinks", "read_cached_output"
  ],
  researcher: [
    "read_note", "list_notes",
    "search_notes", "grep_search", "semantic_search", "deep_search",
    "query_database",
    "generate_flashcards", "create_flashcard",
    "get_backlinks", "read_cached_output"
  ],
  writer: [
    "read_note", "create_note", "create_folder",
    "list_notes", "search_notes", "grep_search",
    "generate_flashcards", "create_flashcard", "read_cached_output"
  ],
};

const MODE_ICONS: Record<AgentModeSlug, string> = {
  editor: "pencil",
  organizer: "folder",
  researcher: "search",
  writer: "pen-tool",
};

/**
 * 获取本地化的模式定义
 */
function getLocalizedModes(): Record<AgentModeSlug, AgentMode> {
  const t = getCurrentTranslations();
  const modes = t.prompts.agent.modes;
  
  return {
    editor: {
      slug: "editor",
      name: modes.editor.name,
      icon: MODE_ICONS.editor,
      roleDefinition: modes.editor.roleDefinition,
      tools: MODE_TOOLS.editor,
    },
    organizer: {
      slug: "organizer",
      name: modes.organizer.name,
      icon: MODE_ICONS.organizer,
      roleDefinition: modes.organizer.roleDefinition,
      tools: MODE_TOOLS.organizer,
    },
    researcher: {
      slug: "researcher",
      name: modes.researcher.name,
      icon: MODE_ICONS.researcher,
      roleDefinition: modes.researcher.roleDefinition,
      tools: MODE_TOOLS.researcher,
    },
    writer: {
      slug: "writer",
      name: modes.writer.name,
      icon: MODE_ICONS.writer,
      roleDefinition: modes.writer.roleDefinition,
      tools: MODE_TOOLS.writer,
    },
  };
}

// 动态获取 MODES（每次访问时根据当前语言返回）
export const MODES = new Proxy({} as Record<AgentModeSlug, AgentMode>, {
  get(_, prop: AgentModeSlug) {
    return getLocalizedModes()[prop];
  },
  ownKeys() {
    return ["editor", "organizer", "researcher", "writer"];
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  },
});

export function getMode(slug: AgentModeSlug): AgentMode {
  return getLocalizedModes()[slug];
}

export function getModeList(): AgentMode[] {
  return Object.values(getLocalizedModes());
}
