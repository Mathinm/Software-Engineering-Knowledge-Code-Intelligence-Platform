"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRight, Expand, LayoutGrid, Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImpactEdge, ImpactNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KindIcon, kindLabel } from "../common";

const W = 200;
// The minimap (120×80, 15 px from the corner) overlays the bottom-right of the canvas.
// Every fit reserves a bottom band taller than it, so no node is ever placed underneath it,
// whatever width the canvas has (e.g. when the details drawer narrows it).
const MINIMAP = { width: 120, height: 80 };
const FIT = { padding: { top: "16px", left: "16px", right: "16px", bottom: `${MINIMAP.height + 15 + 10}px` } } as const;
const H = 64;

type NodeData = ImpactNode & { selected: boolean };

/** Card for one component: icon, name, type, and a count badge (open issues + incidents). */
const ComponentNode = memo(function ComponentNode({ data }: NodeProps<Node<NodeData>>) {
  const badgeTone = data.badge === 0 ? "bg-risk-low text-white" : data.badge >= 3 ? "bg-risk-high text-white" : "bg-risk-med text-white";
  return (
    <div
      className={cn(
        "relative flex h-16 w-[200px] items-center gap-2.5 rounded-lg border-2 bg-card px-3 shadow-sm transition-shadow",
        data.kind === "service" && "border-primary/50",
        data.kind === "api" && "border-api/60",
        data.kind === "table" && "border-table/60",
        data.isRoot && "border-primary shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_22%,transparent)]",
        data.selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
      )}
      title={`${data.name} — ${data.subtitle}${data.depth ? ` (depth ${data.depth})` : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-muted-foreground/40" />
      <KindIcon kind={data.kind} className="size-8 [&_svg]:size-4" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-semibold">{data.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{data.isRoot ? `${kindLabel(data.kind)} · changed` : data.subtitle}</div>
      </div>
      {data.kind === "service" && (
        <span className={cn("absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-background", badgeTone)}
          aria-label={`${data.badge} open issues and incidents`}>
          {data.badge}
        </span>
      )}
      {!data.isRoot && data.depth > 1 && (
        <span className="absolute -bottom-2 left-3 rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground ring-1 ring-border">depth {data.depth}</span>
      )}
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-muted-foreground/40" />
    </div>
  );
});

const nodeTypes = { component: ComponentNode };

const EDGE_STYLE: Record<ImpactEdge["label"], string> = {
  "is used by": "var(--primary)",
  "depends on": "var(--table)",
  exposes: "var(--api)",
};

/** Lay out with dagre, left → right (changed component on the left, impact flows right). */
function layout(nodes: ImpactNode[], edges: ImpactEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 110, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.key, { width: W, height: H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return Object.fromEntries(nodes.map((n) => {
    const p = g.node(n.key);
    return [n.key, { x: p.x - W / 2, y: p.y - H / 2 }];
  }));
}

type Props = {
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  selectedKey: string | null;
  onSelect: (n: ImpactNode) => void;
  canExpand: boolean;
  onExpand: () => void;
  expandHint: string;
};

function Graph({ nodes: rawNodes, edges: rawEdges, selectedKey, onSelect, canExpand, onExpand, expandHint }: Props) {
  const rf = useReactFlow();
  const [zoom, setZoom] = useState(1);
  // Busy graphs start with services only (cleaner first view); the checkbox brings APIs/tables back.
  const [showAssets, setShowAssets] = useState(rawNodes.length <= 9);
  const boxRef = useRef<HTMLDivElement>(null);
  // Re-fit when the canvas is resized (e.g. the details drawer opens or closes).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => rf.fitView({ ...FIT, duration: 200 }), 60); });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [rf]);

  const visible = useMemo(() => {
    const ns = showAssets ? rawNodes : rawNodes.filter((n) => n.kind === "service" || n.isRoot);
    const keys = new Set(ns.map((n) => n.key));
    return { nodes: ns, edges: rawEdges.filter((e) => keys.has(e.source) && keys.has(e.target)) };
  }, [rawNodes, rawEdges, showAssets]);

  const build = useCallback(() => {
    const pos = layout(visible.nodes, visible.edges);
    return visible.nodes.map<Node<NodeData>>((n) => ({
      id: n.key, type: "component", position: pos[n.key], data: { ...n, selected: n.key === selectedKey },
      ariaLabel: `${kindLabel(n.kind)} ${n.name}${n.isRoot ? ", changed component" : `, depth ${n.depth}`}. Press Enter for details.`,
    }));
  }, [visible, selectedKey]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);

  // Re-layout when the result (or the asset toggle) changes
  useEffect(() => {
    setNodes(build());
    requestAnimationFrame(() => rf.fitView({ ...FIT, duration: 250 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  // Selection only restyles; keep dragged positions
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, selected: n.id === selectedKey } })));
  }, [selectedKey, setNodes]);

  const edges = useMemo<Edge[]>(() => visible.edges.map((e, i) => ({
    id: `e${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label,
    type: "default",
    style: { stroke: EDGE_STYLE[e.label], strokeWidth: 1.6 },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_STYLE[e.label], width: 16, height: 16 },
    labelStyle: { fontSize: 11, fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--card)" },
    labelBgPadding: [4, 2] as [number, number],
  })), [visible.edges]);

  const autoLayout = () => {
    setNodes(build());
    requestAnimationFrame(() => rf.fitView({ ...FIT, duration: 250 }));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 overflow-x-auto border-b p-2 [&>*]:shrink-0" role="toolbar" aria-label="Graph controls">
        <Tooltip>
          <TooltipTrigger asChild>
            <span><Button variant="outline" size="sm" onClick={onExpand} disabled={!canExpand} className="text-primary"><Plus /> Expand next level</Button></span>
          </TooltipTrigger>
          <TooltipContent>{expandHint}</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={autoLayout}><LayoutGrid /> Auto layout</Button>
        <label className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm">
          <input type="checkbox" checked={showAssets} onChange={(e) => setShowAssets(e.target.checked)} className="accent-[var(--primary)]" />
          APIs &amp; tables
        </label>
        <div className="ml-auto flex items-center rounded-md border">
          <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })}><Minus /></Button>
          <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })}><Plus /></Button>
        </div>
        <Button variant="outline" size="icon-sm" aria-label="Fit graph to screen" onClick={() => rf.fitView({ ...FIT, duration: 250 })}><Maximize /></Button>
      </div>
      <div ref={boxRef} className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            // keyboard: Enter on a focused node selects it → open the drawer too
            for (const c of changes) {
              if (c.type === "select" && c.selected) {
                const n = nodes.find((x) => x.id === c.id);
                if (n) onSelect(n.data);
              }
            }
          }}
          onNodeClick={(_, n) => onSelect(n.data)}
          onMove={(_, vp) => setZoom(vp.zoom)}
          nodesConnectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          minZoom={0.2}
          maxZoom={2}
          fitView
          fitViewOptions={FIT}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} color="var(--border)" />
          <MiniMap pannable zoomable style={MINIMAP} className="!bg-card !border" nodeColor={(n) => (n.data as NodeData).kind === "api" ? "var(--api)" : (n.data as NodeData).kind === "table" ? "var(--table)" : "var(--primary)"} ariaLabel="Graph minimap" />
        </ReactFlow>
      </div>
      <Legend />
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-3 py-2 text-xs text-muted-foreground" aria-label="Graph legend">
      <span className="flex items-center gap-1.5"><KindIcon kind="service" className="size-5" /> Service</span>
      <span className="flex items-center gap-1.5"><KindIcon kind="api" className="size-5" /> API</span>
      <span className="flex items-center gap-1.5"><KindIcon kind="table" className="size-5" /> Database table</span>
      <span className="flex items-center gap-1.5"><ArrowRight className="size-4 text-primary" aria-hidden /> <b className="font-medium text-foreground">is used by</b> (provider → consumer, impact flows this way)</span>
      <span className="flex items-center gap-1.5"><ArrowRight className="size-4 text-table" aria-hidden /> <b className="font-medium text-foreground">depends on</b> (service → table it uses)</span>
      <span className="flex items-center gap-1.5"><ArrowRight className="size-4 text-api" aria-hidden /> <b className="font-medium text-foreground">exposes</b> (service → its API)</span>
      <span className="flex items-center gap-1.5"><span className="flex size-4 items-center justify-center rounded-full bg-risk-med text-[9px] font-bold text-white">2</span> = open issues + incidents</span>
      <span className="flex items-center gap-1.5"><Expand className="size-3.5" aria-hidden /> depth = hops from the changed component</span>
    </div>
  );
}

export function ImpactGraph(props: Props) {
  return <ReactFlowProvider><Graph {...props} /></ReactFlowProvider>;
}
