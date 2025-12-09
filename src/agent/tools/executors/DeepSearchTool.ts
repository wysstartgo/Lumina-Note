/**
 * deep_search 复合工具执行器
 * 搜索 + 批量读取，一次返回所有需要的信息，减少 LLM 往返
 * 
 * 优化：
 * 1. 并行读取文件内容
 * 2. 使用 noteIndex 快速过滤（标题匹配）
 * 3. 限制 grep 扫描数量，优先使用语义搜索
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile } from "@/lib/tauri";
import { resolve } from "@/lib/path";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { toolMsg } from "./messages";

interface SearchHit {
  path: string;
  source: "title" | "grep" | "semantic";
  score?: number;
  matchLine?: string;
}

// 并发控制：最多同时读取的文件数
const MAX_CONCURRENT_READS = 10;

export const DeepSearchTool: ToolExecutor = {
  name: "deep_search",
  requiresApproval: false, // 只读操作

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const query = params.query as string;
    const limit = (params.limit as number) || 5;
    const includeContent = params.include_content !== false; // 默认 true

    if (!query || typeof query !== "string") {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: query required`,
      };
    }

    const startTime = Date.now();

    try {
      const hits: SearchHit[] = [];
      const seenPaths = new Set<string>();

      // 1. 标题匹配（最快，直接从索引获取）
      const titleHits = searchByTitle(query);
      for (const hit of titleHits) {
        if (!seenPaths.has(hit.path)) {
          seenPaths.add(hit.path);
          hits.push(hit);
        }
      }

      // 2. 语义搜索（如果 RAG 已启用）- 优先于 grep
      const ragStore = useRAGStore.getState();
      const ragManager = ragStore.ragManager;
      if (ragStore.config.enabled && ragManager?.isInitialized()) {
        try {
          const results = await ragManager.search(query, { limit: limit * 3 });
          for (const r of results) {
            if (r.filePath && !seenPaths.has(r.filePath)) {
              seenPaths.add(r.filePath);
              hits.push({
                path: r.filePath,
                source: "semantic",
                score: r.score,
              });
            }
          }
        } catch (e) {
          console.warn("[deep_search] 语义搜索失败:", e);
        }
      }

      // 3. Grep 搜索（仅当结果不足时）- 限制扫描数量
      if (hits.length < limit) {
        const grepHits = await grepSearchOptimized(query, context.workspacePath, limit * 2, seenPaths);
        for (const hit of grepHits) {
          if (!seenPaths.has(hit.path)) {
            seenPaths.add(hit.path);
            hits.push(hit);
          }
        }
      }

      if (hits.length === 0) {
        return {
          success: true,
          content: toolMsg.search.noResults(),
        };
      }

      // 4. 排序：标题匹配 > 语义高分 > grep
      hits.sort((a, b) => {
        // 标题匹配最优先
        if (a.source === "title" && b.source !== "title") return -1;
        if (b.source === "title" && a.source !== "title") return 1;
        // 然后按分数排序
        return (b.score || 0) - (a.score || 0);
      });

      // 5. 取 top N
      const topHits = hits.slice(0, limit);

      // 6. Build search result summary
      let output = `## Search Results: "${query}"\n\n`;
      output += `${toolMsg.search.found(hits.length)}, showing top ${topHits.length}:\n\n`;

      topHits.forEach((hit, i) => {
        const sourceLabel = hit.source === "title" 
          ? "title" 
          : hit.source === "semantic" 
            ? `semantic ${((hit.score || 0) * 100).toFixed(0)}%` 
            : "keyword";
        output += `${i + 1}. **${hit.path}** [${sourceLabel}]\n`;
      });

      // 7. Read content in parallel
      if (includeContent) {
        output += `\n---\n\n## Note Content\n`;

        const contentResults = await readFilesParallel(
          topHits.map(hit => ({
            path: hit.path,
            fullPath: resolve(context.workspacePath, hit.path),
          })),
          MAX_CONCURRENT_READS
        );

        for (const result of contentResults) {
          if (result.success) {
            // 限制单个文件内容长度
            const maxLength = 2000;
            const truncated = result.content!.length > maxLength 
              ? result.content!.slice(0, maxLength) + "\n\n... (truncated, use read_note for full content)"
              : result.content!;

            output += `\n### 📄 ${result.path}\n\n\`\`\`markdown\n${truncated}\n\`\`\`\n`;
          } else {
            output += `\n### 📄 ${result.path}\n\n> Read failed: ${result.error}\n`;
          }
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`[deep_search] completed in ${elapsed}ms, found ${hits.length} results`);

      return {
        success: true,
        content: output,
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

/**
 * 从标题/文件名快速搜索（无 IO）
 */
function searchByTitle(query: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const noteIndex = useNoteIndexStore.getState().noteIndex;
  const queryLower = query.toLowerCase();

  for (const [path, note] of noteIndex) {
    // 检查文件名是否包含查询词
    if (note.name.toLowerCase().includes(queryLower)) {
      hits.push({
        path,
        source: "title",
        score: 0.9, // 标题匹配给高分
      });
    }
  }

  return hits;
}

/**
 * 优化的 grep 搜索：限制扫描数量，跳过已找到的文件
 */
async function grepSearchOptimized(
  query: string, 
  workspacePath: string, 
  maxScan: number,
  skipPaths: Set<string>
): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];
  const noteIndex = useNoteIndexStore.getState().noteIndex;
  const queryLower = query.toLowerCase();

  let scanned = 0;
  const paths = Array.from(noteIndex.keys());

  // 并行读取文件进行 grep
  const batchSize = 5;
  for (let i = 0; i < paths.length && scanned < maxScan; i += batchSize) {
    const batch = paths.slice(i, i + batchSize).filter(p => !skipPaths.has(p));
    
    const results = await Promise.all(
      batch.map(async (path) => {
        try {
          const fullPath = resolve(workspacePath, path);
          const content = await readFile(fullPath);
          scanned++;
          
          if (content.toLowerCase().includes(queryLower)) {
            // 找到包含关键词的行
            const lines = content.split("\n");
            let matchLine = "";
            for (const line of lines) {
              if (line.toLowerCase().includes(queryLower)) {
                matchLine = line.trim().slice(0, 100);
                break;
              }
            }
            
            return {
              path,
              source: "grep" as const,
              matchLine,
              score: 0.5,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    for (const result of results) {
      if (result) {
        hits.push(result);
      }
    }
  }

  return hits;
}

/**
 * 并行读取多个文件
 */
async function readFilesParallel(
  files: { path: string; fullPath: string }[],
  concurrency: number
): Promise<{ path: string; success: boolean; content?: string; error?: string }[]> {
  const results: { path: string; success: boolean; content?: string; error?: string }[] = [];

  // 分批并行读取
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await readFile(file.fullPath);
          return { path: file.path, success: true, content };
        } catch (e) {
          return { 
            path: file.path, 
            success: false, 
            error: e instanceof Error ? e.message : "unknown error" 
          };
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}
