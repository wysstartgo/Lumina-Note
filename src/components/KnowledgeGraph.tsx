import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useFileStore } from "@/stores/useFileStore";
import {
  ZoomIn,
  ZoomOut,
  RefreshCw,
  FileText,
  Link as LinkIcon,
  MousePointer2,
  Settings,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface GraphNode {
  id: string;
  label: string;
  path: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
  isDragging?: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
}

// Extract [[wikilinks]] from content
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)]; // Remove duplicates
}

// Physics Engine
const PhysicsEngine = {
  init: (nodes: GraphNode[], width: number, height: number): GraphNode[] => {
    return nodes.map((n, i) => ({
      ...n,
      x: width / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 50,
      y: height / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 50,
      vx: 0,
      vy: 0,
    }));
  },

  step: (
    nodes: GraphNode[],
    edges: GraphEdge[],
    params: {
      repulsion: number;
      springLength: number;
      springStrength: number;
      centerPull: number;
      friction: number;
      dt: number;
      width: number;
      height: number;
    }
  ): GraphNode[] => {
    const { repulsion, springLength, springStrength, centerPull, friction, dt, width, height } = params;
    const cx = width / 2;
    const cy = height / 2;

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      const u = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const v = nodes[j];
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        let distSq = dx * dx + dy * dy;
        if (distSq === 0) distSq = 0.01;
        const dist = Math.sqrt(distSq);

        if (dist < 500) {
          const force = repulsion / (distSq + 100);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!u.isDragging) { u.vx += fx * dt; u.vy += fy * dt; }
          if (!v.isDragging) { v.vx -= fx * dt; v.vy -= fy * dt; }
        }
      }
    }

    // Spring forces (edges)
    edges.forEach((e) => {
      const u = nodes.find((n) => n.id === e.source);
      const v = nodes.find((n) => n.id === e.target);
      if (!u || !v) return;

      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const force = (dist - springLength) * springStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!u.isDragging) { u.vx += fx * dt; u.vy += fy * dt; }
      if (!v.isDragging) { v.vx -= fx * dt; v.vy -= fy * dt; }
    });

    // Center pull and update positions
    nodes.forEach((n) => {
      if (n.isDragging) return;

      const dx = cx - n.x;
      const dy = cy - n.y;
      n.vx += dx * centerPull * dt;
      n.vy += dy * centerPull * dt;

      n.x += n.vx * dt;
      n.y += n.vy * dt;

      n.vx *= friction;
      n.vy *= friction;

      // Boundary constraints
      const margin = 30;
      if (n.x < margin) n.vx += 50 * dt;
      if (n.x > width - margin) n.vx -= 50 * dt;
      if (n.y < margin) n.vy += 50 * dt;
      if (n.y > height - margin) n.vy -= 50 * dt;
    });

    return nodes;
  },
};

interface KnowledgeGraphProps {
  className?: string;
}

export function KnowledgeGraph({ className = "" }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  const { fileTree, currentFile, openFile } = useFileStore();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });

  const isDraggingCanvas = useRef(false);
  const isDraggingNode = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const draggedNodeId = useRef<string | null>(null);
  const hasDragged = useRef(false); // 是否发生了拖拽
  const clickedNodeRef = useRef<GraphNode | null>(null); // 点击的节点

  const [params, setParams] = useState({
    repulsion: 3000,
    springLength: 100,
    springStrength: 0.08,
    centerPull: 0.015,
    friction: 0.88,
    dt: 0.15,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [nodeSize, setNodeSize] = useState(1.0);
  const [showLabels, setShowLabels] = useState(true);

  // Build graph from file tree
  const buildGraph = useCallback(async () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Recursive function to process files
    const processFiles = (entries: typeof fileTree) => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          processFiles(entry.children);
        } else if (!entry.is_dir && entry.name.endsWith(".md")) {
          const nodeName = entry.name.replace(".md", "");
          const node: GraphNode = {
            id: nodeName,
            label: nodeName,
            path: entry.path,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            connections: 0,
          };
          nodes.push(node);
          nodeMap.set(nodeName.toLowerCase(), node);
        }
      }
    };

    processFiles(fileTree);

    // Now read each file to extract links
    // For performance, we'll do this asynchronously
    const { readFile } = await import("@/lib/tauri");
    
    for (const node of nodes) {
      try {
        const content = await readFile(node.path);
        const links = extractWikiLinks(content);
        
        for (const linkName of links) {
          const targetNode = nodeMap.get(linkName.toLowerCase());
          if (targetNode && targetNode.id !== node.id) {
            // Check if edge already exists
            const exists = edges.some(
              (e) =>
                (e.source === node.id && e.target === targetNode.id) ||
                (e.source === targetNode.id && e.target === node.id)
            );
            if (!exists) {
              edges.push({ source: node.id, target: targetNode.id });
              node.connections++;
              targetNode.connections++;
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    // Initialize positions
    const width = containerRef.current?.offsetWidth || 400;
    const height = containerRef.current?.offsetHeight || 400;
    nodesRef.current = PhysicsEngine.init(nodes, width, height);
    edgesRef.current = edges;
    
    setDimensions({ width, height });
  }, [fileTree]);

  // Build graph on mount and when file tree changes
  useEffect(() => {
    if (fileTree.length > 0) {
      buildGraph();
    }
  }, [fileTree, buildGraph]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Render loop with high DPI support
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size for high DPI
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    PhysicsEngine.step(nodesRef.current, edgesRef.current, { ...params, width, height });

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    const hasSelection = selectedNode !== null || hoverNode !== null;

    // Draw edges
    edgesRef.current.forEach((edge) => {
      const u = nodesRef.current.find((n) => n.id === edge.source);
      const v = nodesRef.current.find((n) => n.id === edge.target);
      if (!u || !v) return;

      const isHighlighted =
        (hoverNode && (u.id === hoverNode || v.id === hoverNode)) ||
        (selectedNode && (u.id === selectedNode.id || v.id === selectedNode.id));

      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);

      if (hasSelection) {
        if (isHighlighted) {
          ctx.strokeStyle = "hsl(var(--primary))";
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 2 / zoom;
        } else {
          ctx.strokeStyle = "hsl(var(--muted-foreground))";
          ctx.globalAlpha = 0.1;
          ctx.lineWidth = 1 / zoom;
        }
      } else {
        ctx.strokeStyle = "hsl(var(--muted-foreground))";
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1 / zoom;
      }
      ctx.stroke();
    });

    // Draw nodes
    nodesRef.current.forEach((node) => {
      const isHovered = node.id === hoverNode;
      const isSelected = selectedNode && node.id === selectedNode.id;
      const isCurrent = currentFile?.includes(node.label);

      let isNeighbor = false;
      const targetId = hoverNode || (selectedNode ? selectedNode.id : null);
      if (targetId) {
        isNeighbor = edgesRef.current.some(
          (e) =>
            (e.source === targetId && e.target === node.id) ||
            (e.target === targetId && e.source === node.id)
        );
      }

      const isHighlighted = isHovered || isSelected || isNeighbor || isCurrent;

      ctx.globalAlpha = hasSelection && !isHighlighted ? 0.15 : 1;

      // 使用对数缩放，限制最大尺寸
      const baseRadius = Math.max(4, 5 + Math.log(node.connections + 1) * 4);
      const radius = Math.min(baseRadius * nodeSize, 25); // 最大 25px

      // Node color
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      
      if (isCurrent) {
        ctx.fillStyle = "hsl(var(--primary))";
      } else if (isHighlighted) {
        ctx.fillStyle = "hsl(var(--primary) / 0.8)";
      } else {
        ctx.fillStyle = "hsl(var(--muted-foreground))";
      }
      ctx.fill();

      // Node border
      if (isHighlighted) {
        ctx.strokeStyle = "hsl(var(--primary))";
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      }

      // Label
      if (showLabels && (isHighlighted || zoom > 0.8)) {
        ctx.globalAlpha = isHighlighted ? 1 : (hasSelection ? 0.15 : 0.7);
        ctx.fillStyle = "hsl(var(--foreground))";
        ctx.font = `${Math.max(10, 12 / zoom)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + radius + 14 / zoom);
      }
    });

    ctx.restore();
    animationRef.current = requestAnimationFrame(render);
  }, [params, zoom, pan, hoverNode, selectedNode, currentFile, dimensions, nodeSize, showLabels]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  // Interaction handlers
  const getScreenPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getWorldPos = (screenX: number, screenY: number) => {
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    return {
      x: (screenX - cx - pan.x) / zoom + cx,
      y: (screenY - cy - pan.y) / zoom + cy,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getScreenPos(e);
    const worldPos = getWorldPos(x, y);

    hasDragged.current = false; // 重置拖拽状态
    dragStart.current = { x, y };

    const clickedNode = nodesRef.current.find((n) => {
      const baseR = Math.max(4, 5 + Math.log(n.connections + 1) * 4);
      const r = Math.min(baseR * nodeSize, 25) + 8; // 使用相同的半径计算
      return Math.hypot(n.x - worldPos.x, n.y - worldPos.y) < r;
    });

    if (clickedNode) {
      isDraggingNode.current = true;
      draggedNodeId.current = clickedNode.id;
      clickedNodeRef.current = clickedNode;
      clickedNode.isDragging = true;
      setSelectedNode(clickedNode);
    } else {
      isDraggingCanvas.current = true;
      clickedNodeRef.current = null;
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getScreenPos(e);
    const worldPos = getWorldPos(x, y);

    if (!isDraggingNode.current && !isDraggingCanvas.current) {
      const hovered = nodesRef.current.find((n) => {
        const r = Math.max(4, 5 + n.connections * 1.5) + 5;
        return Math.hypot(n.x - worldPos.x, n.y - worldPos.y) < r;
      });
      setHoverNode(hovered ? hovered.id : null);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hovered ? "pointer" : "grab";
      }
    }

    if (isDraggingNode.current && draggedNodeId.current) {
      const node = nodesRef.current.find((n) => n.id === draggedNodeId.current);
      if (node) {
        // 检测是否真的在拖拽（移动超过 3 像素）
        const dx = x - dragStart.current.x;
        const dy = y - dragStart.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasDragged.current = true;
        }
        
        node.x = worldPos.x;
        node.y = worldPos.y;
        node.vx = 0;
        node.vy = 0;
      }
    }

    if (isDraggingCanvas.current) {
      const dx = x - dragStart.current.x;
      const dy = y - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged.current = true;
      }
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      dragStart.current = { x, y };
    }
  };

  const handleMouseUp = () => {
    // 如果点击了节点且没有拖拽，则打开笔记
    if (clickedNodeRef.current && !hasDragged.current) {
      openFile(clickedNodeRef.current.path);
    }
    
    if (isDraggingNode.current && draggedNodeId.current) {
      const node = nodesRef.current.find((n) => n.id === draggedNodeId.current);
      if (node) node.isDragging = false;
    }
    isDraggingNode.current = false;
    isDraggingCanvas.current = false;
    draggedNodeId.current = null;
    clickedNodeRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(Math.max(z * delta, 0.3), 3));
  };

  const handleNodeClick = (node: GraphNode) => {
    openFile(node.path);
  };

  // Get connected nodes for selected node
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    return edgesRef.current
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .map((e) => {
        const targetId = e.source === selectedNode.id ? e.target : e.source;
        return nodesRef.current.find((n) => n.id === targetId);
      })
      .filter(Boolean) as GraphNode[];
  }, [selectedNode]);

  return (
    <div className={`flex h-full ${className}`}>
      {/* Settings Panel */}
      <div className={cn(
        "w-64 border-r border-border bg-background flex-shrink-0 overflow-y-auto transition-all duration-200",
        showSettings ? "opacity-100" : "w-0 opacity-0 overflow-hidden"
      )}>
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">图谱设置</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1 hover:bg-muted rounded"
            >
              <ChevronUp size={14} />
            </button>
          </div>

          {/* Physics */}
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">物理引擎</h4>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>节点斥力</span>
                <span className="text-muted-foreground">{params.repulsion}</span>
              </div>
              <input
                type="range"
                min="500"
                max="10000"
                step="100"
                value={params.repulsion}
                onChange={(e) => setParams({ ...params, repulsion: Number(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>连线长度</span>
                <span className="text-muted-foreground">{params.springLength}</span>
              </div>
              <input
                type="range"
                min="30"
                max="300"
                step="10"
                value={params.springLength}
                onChange={(e) => setParams({ ...params, springLength: Number(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>向心力</span>
                <span className="text-muted-foreground">{params.centerPull.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.05"
                step="0.001"
                value={params.centerPull}
                onChange={(e) => setParams({ ...params, centerPull: Number(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          {/* Visual */}
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">视觉效果</h4>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>节点大小</span>
                <span className="text-muted-foreground">{nodeSize.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={nodeSize}
                onChange={(e) => setNodeSize(Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded border-border"
              />
              <span>显示标签</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 flex flex-col">
        {/* Controls */}
        <div className="p-2 border-b border-border flex items-center justify-between bg-background">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-1.5 rounded transition-colors",
                showSettings ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
              title="图谱设置"
            >
              <Settings size={16} />
            </button>
            <span className="text-xs text-muted-foreground">
              {nodesRef.current.length} 节点 · {edgesRef.current.length} 连接
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.min(z * 1.2, 3))}
              className="p-1 hover:bg-muted rounded text-muted-foreground"
            >
              <ZoomIn size={14} />
            </button>
            <span className="text-[10px] w-10 text-center text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
              className="p-1 hover:bg-muted rounded text-muted-foreground"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={buildGraph}
              className="p-1 hover:bg-muted rounded text-muted-foreground ml-1"
              title="刷新图谱"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative bg-muted/20 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={() => {
            if (selectedNode) {
              handleNodeClick(selectedNode);
            }
          }}
          className="block w-full h-full cursor-grab active:cursor-grabbing"
        />
        </div>

        {/* Node details */}
        {selectedNode && (
          <div className="p-3 border-t border-border bg-background space-y-2 max-h-40 overflow-y-auto">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-primary" />
              <span
                className="text-sm font-medium text-foreground hover:text-primary cursor-pointer"
                onClick={() => handleNodeClick(selectedNode)}
              >
                {selectedNode.label}
              </span>
            </div>
            {connectedNodes.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                  <LinkIcon size={10} />
                  关联笔记 ({connectedNodes.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {connectedNodes.slice(0, 8).map((node) => (
                    <button
                      key={node.id}
                      onClick={() => {
                        setSelectedNode(node);
                        openFile(node.path);
                      }}
                      className="text-xs px-2 py-0.5 bg-muted rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {node.label}
                    </button>
                  ))}
                  {connectedNodes.length > 8 && (
                    <span className="text-xs text-muted-foreground">
                      +{connectedNodes.length - 8}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {nodesRef.current.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MousePointer2 size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无笔记</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
