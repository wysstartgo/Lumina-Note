/**
 * System Prompt 构建器
 * 
 * 模块化组装 System Prompt
 * 支持多语言国际化
 */

import { TaskContext, AgentMode, ToolDefinition } from "../types";
import { getAllToolDefinitions, attemptCompletionDefinition } from "../tools/definitions";
import { MODES } from "../modes";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

export class PromptBuilder {
  private mode: AgentMode;
  private tools: ToolDefinition[];

  constructor(mode?: AgentMode) {
    this.mode = mode || MODES.editor;
    this.tools = this.buildToolList(this.mode);
  }

  /**
   * 构建完整的 System Prompt
   * 
   * 结构优化：上下文/引用放前面，重要指示放后面（大模型更容易记住后面的内容）
   */
  build(context: TaskContext): string {
    const mode = context.mode || this.mode;
    
    // 根据实际使用的 mode 重新构建工具列表，确保 tools 和 mode 同步
    if (mode !== this.mode) {
      this.tools = this.buildToolList(mode);
    }

    return `${this.getRoleDefinition(mode)}

${this.getContextSection(context)}

${this.getToolsCatalog()}

${this.getCapabilitiesSection()}

${this.getToolUseSection()}

${this.getRulesSection(context)}

${this.getObjectiveSection(mode)}`;
  }

  /**
   * 设置模式
   */
  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.tools = this.buildToolList(mode);
  }

  private buildToolList(mode: AgentMode): ToolDefinition[] {
    const base = getAllToolDefinitions().filter((tool) => mode.tools.includes(tool.name));
    // 协议标记：始终附加 attempt_completion 规范（无副作用，仅用于结束汇报）
    const exists = base.some((t) => t.name === "attempt_completion");
    return exists ? base : [...base, attemptCompletionDefinition];
  }

  // ============ Prompt 各部分 ============

  private getRoleDefinition(mode: AgentMode): string {
    const t = getCurrentTranslations();
    const p = t.prompts.agent;
    return `${p.role}

${mode.roleDefinition}

${p.expertise}`;
  }

  private getToolUseSection(): string {
    const t = getCurrentTranslations();
    const p = t.prompts.agent;
    
    // 动态生成工具名列表
    const toolNames = this.tools
      .map(tool => tool.name)
      .filter(name => !["attempt_completion", "ask_user", "read_cached_output"].includes(name))
      .join(", ");

    return `====

TOOL USE

${p.toolUseIntro}

${p.toolUsePrinciples}

${p.toolFormat}

${p.toolRules}

${p.toolWarning}

✅ **Valid tool names**:
${toolNames}

${p.protocolActions}

${p.toolPriority}

${p.searchGuide}`;
  }

  private getToolsCatalog(): string {
    // 工具定义保持英文（技术名称不翻译）
    return `====

TOOLS

${this.tools.map((tool) => tool.definition).join("\n\n")}`;
  }

  private getCapabilitiesSection(): string {
    const t = getCurrentTranslations();
    const p = t.prompts.agent;
    return `====

CAPABILITIES

${p.capabilities}`;
  }

  private getRulesSection(context: TaskContext): string {
    const t = getCurrentTranslations();
    const p = t.prompts.agent;
    
    let baseRules = `====

RULES

Workspace root: ${context.workspacePath}

${p.baseRules}

${p.editVsCreate}

${p.flashcardRules}`;

    // 针对 Writer 模式的特殊规则
    if (context.mode?.slug === "writer") {
      baseRules += `\n\n${p.writerRules}`;
    }

    // 针对 Organizer 模式的特殊规则
    if (context.mode?.slug === "organizer") {
      baseRules += `\n\n${p.organizerRules}`;
    }

    return baseRules;
  }

  private getContextSection(context: TaskContext): string {
    const t = getCurrentTranslations();
    const c = t.prompts.agent.context;
    
    let section = `====

CONTEXT

${c.workspacePath}: ${context.workspacePath}
${c.activeNote}: ${context.activeNote || c.none}`;

    if (context.fileTree) {
      section += `

${c.fileTree}:
${context.fileTree}`;
    }

    if (context.recentNotes && context.recentNotes.length > 0) {
      section += `

${c.recentNotes}:
${context.recentNotes.map((n) => `- ${n}`).join("\n")}`;
    }

    // RAG 自动注入
    if (context.ragResults && context.ragResults.length > 0) {
      section += `

${c.ragResults}:
${context.ragResults.map((r, i) => `${i + 1}. ${r.filePath} (${(r.score * 100).toFixed(0)}%)${r.heading ? ` - ${r.heading}` : ""}`).join("\n")}`;
    }

    return section;
  }

  private getObjectiveSection(mode: AgentMode): string {
    const t = getCurrentTranslations();
    const o = t.prompts.agent.objective;
    
    return `====

OBJECTIVE

${o.identity}: ${mode.name}
${o.coreRole}: ${mode.roleDefinition}

${o.keyRule}

1. ${o.toolTask}:
   - ${o.toolTaskDesc}

2. ${o.qaTask}:
   - ${o.qaTaskDesc}

${o.waitForTask}`;
  }
}
