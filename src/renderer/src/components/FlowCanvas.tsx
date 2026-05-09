import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { NODE_W, NODE_H } from "../data/constants";
import { nodePos, edgeGeom, PAD_X, PAD_Y } from "../utils/flow";
import { FlowNode } from "./FlowNode";
import type { Flow, FlowNode as FlowNodeModel, RunState } from "../types";

const PROMPT_NODE_H = 132;

type DragState = {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
};

type ConnectingState = {
  fromId: string;
  x1: number;
  y1: number;
  mx: number;
  my: number;
  hoverId: string | null;
};

type FlowCanvasProps = {
  flow: Flow | null;
  runState: RunState;
  building: boolean;
  focusId?: string | null;
  onFocus?: (id: string) => void;
  onMoveNode?: (id: string, x: number, y: number) => void;
  onDeleteNode?: (id: string) => void;
  onDeleteEdge?: (from: string, to: string) => void;
  onAddEdge?: (from: string, to: string) => void;
  onPromptChange?: (id: string, prompt: string) => void;
};

export function FlowCanvas({
  flow,
  runState,
  building,
  onFocus,
  onMoveNode,
  onDeleteNode,
  onDeleteEdge,
  onAddEdge,
  onPromptChange,
}: FlowCanvasProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  if (!flow) return null;
  const nodeMap = Object.fromEntries(flow.nodes.map((node) => [node.id, node])) as Record<string, FlowNodeModel>;

  const maxX = Math.max(...flow.nodes.map((node) => nodePos(node).x + NODE_W));
  const maxY = Math.max(...flow.nodes.map((node) => nodePos(node).y + NODE_H));
  const W = maxX + PAD_X;
  const H = maxY + PAD_Y;

  function handlePortMouseDown(event: MouseEvent<HTMLDivElement>, node: FlowNodeModel): void {
    if (event.button !== 0) return;
    const isPrompt = node.type === "prompt";
    const { x, y } = nodePos(node);
    const x1 = x + NODE_W;
    const y1 = isPrompt ? y + PROMPT_NODE_H - 26 : y + NODE_H / 2;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const initMx = event.clientX - rect.left;
    const initMy = event.clientY - rect.top;
    setConnecting({ fromId: node.id, x1, y1, mx: initMx, my: initMy, hoverId: null });

    const scroller = canvasEl.parentElement;
    let lastClientX = event.clientX;
    let lastClientY = event.clientY;
    let rafId = 0;
    const EDGE = 48; // px from viewport edge that triggers auto-scroll
    const MAX_SPEED = 18; // px per frame at the very edge

    function recompute(): void {
      const r = canvasEl!.getBoundingClientRect();
      const cx = lastClientX - r.left;
      const cy = lastClientY - r.top;
      const target = document.elementFromPoint(lastClientX, lastClientY) as HTMLElement | null;
      const nodeEl = target?.closest?.(".fc-node");
      const hoverId = nodeEl?.getAttribute("data-node-id") || null;
      setConnecting((current) =>
        current && {
          ...current,
          mx: cx,
          my: cy,
          hoverId: hoverId !== node.id ? hoverId : null,
        },
      );
    }

    function tick(): void {
      if (scroller) {
        const sr = scroller.getBoundingClientRect();
        let dy = 0;
        let dx = 0;
        const distTop = lastClientY - sr.top;
        const distBot = sr.bottom - lastClientY;
        const distLeft = lastClientX - sr.left;
        const distRight = sr.right - lastClientX;
        if (distTop < EDGE && distTop > -EDGE) dy = -MAX_SPEED * Math.max(0, (EDGE - distTop) / EDGE);
        else if (distBot < EDGE && distBot > -EDGE) dy = MAX_SPEED * Math.max(0, (EDGE - distBot) / EDGE);
        if (distLeft < EDGE && distLeft > -EDGE) dx = -MAX_SPEED * Math.max(0, (EDGE - distLeft) / EDGE);
        else if (distRight < EDGE && distRight > -EDGE) dx = MAX_SPEED * Math.max(0, (EDGE - distRight) / EDGE);
        if (dx || dy) {
          scroller.scrollLeft += dx;
          scroller.scrollTop += dy;
          recompute();
        }
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      recompute();
    };

    const onUp = (upEvent: globalThis.MouseEvent): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(rafId);
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY) as HTMLElement | null;
      const nodeEl = target?.closest?.(".fc-node");
      const toId = nodeEl?.getAttribute("data-node-id") || null;
      if (toId && toId !== node.id) onAddEdge?.(node.id, toId);
      setConnecting(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleNodeMouseDown(event: MouseEvent<HTMLDivElement>, node: FlowNodeModel): void {
    if (event.button !== 0) return;
    const { x, y } = nodePos(node);
    dragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: x,
      origY: y,
      moved: false,
    };

    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        setDraggingId(drag.id);
      }
      if (drag.moved) {
        onMoveNode?.(drag.id, Math.max(0, drag.origX + dx), Math.max(0, drag.origY + dy));
      }
    };

    const onUp = (): void => {
      const drag = dragRef.current;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (drag && !drag.moved) onFocus?.(drag.id);
      dragRef.current = null;
      setDraggingId(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Pan via left-click or middle-click on any empty canvas space. Skip
  // nodes (they have their own drag) and any port/edge interactive bits.
  function handleBgMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest(".fc-node, .fc-edge-hit, .fc-edge-del, .fc-palette")) return;
    event.preventDefault();
    const scroller = document.querySelector<HTMLElement>(".cf-canvas-wrap");
    if (!scroller) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollX = scroller.scrollLeft;
    const startScrollY = scroller.scrollTop;
    document.body.classList.add("is-panning");
    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      scroller.scrollLeft = startScrollX - (moveEvent.clientX - startX);
      scroller.scrollTop = startScrollY - (moveEvent.clientY - startY);
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("is-panning");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function ghostPath(): string {
    if (!connecting) return "";
    const { x1, y1, mx, my } = connecting;
    const dx = Math.max(28, Math.abs(mx - x1) * 0.55);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${mx - dx} ${my}, ${mx} ${my}`;
  }

  return (
    <div className="fc-wrap" onMouseDown={handleBgMouseDown}>
      <div
        className="fc-canvas"
        ref={canvasRef}
        style={{ width: W, height: H }}
      >
        <svg className="fc-edges" width={W} height={H}>
          <defs>
            <marker id="fc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(200,205,215,0.55)" />
            </marker>
          </defs>
          {flow.edges.map(([from, to], i) => {
            const fromNode = nodeMap[from];
            const toNode = nodeMap[to];
            if (!fromNode || !toNode) return null;
            const active = runState[from] === "done" && Boolean(runState[to]);
            const key = `${from}>${to}`;
            const isHover = hoverEdge === key;
            const { d } = edgeGeom(fromNode, toNode);
            const revealStyle: CSSProperties =
              !fromNode._userPlaced && !toNode._userPlaced
                ? { animationDelay: `${(i + 2) * 50}ms` }
                : { animation: "none", opacity: 1 };
            return (
              <g key={`${from}-${to}-${i}`}>
                <path
                  d={d}
                  className={`fc-edge ${active ? "is-active" : ""} ${isHover ? "is-hover" : ""}`}
                  markerEnd="url(#fc-arrow)"
                  style={revealStyle}
                />
                <path
                  d={d}
                  className="fc-edge-hit"
                  onMouseEnter={() => setHoverEdge(key)}
                  onMouseLeave={() => setHoverEdge((current) => (current === key ? null : current))}
                />
              </g>
            );
          })}
        </svg>

        {flow.edges.map(([from, to], i) => {
          const fromNode = nodeMap[from];
          const toNode = nodeMap[to];
          if (!fromNode || !toNode) return null;
          const key = `${from}>${to}`;
          const { mx, my } = edgeGeom(fromNode, toNode);
          const isHover = hoverEdge === key;
          return (
            <button
              key={`del-${from}-${to}-${i}`}
              className={`fc-edge-del ${isHover ? "is-visible" : ""}`}
              style={{ left: mx, top: my }}
              title="Remove connection"
              onMouseEnter={() => setHoverEdge(key)}
              onMouseLeave={() => setHoverEdge((current) => (current === key ? null : current))}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteEdge?.(from, to);
                setHoverEdge(null);
              }}
            >
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          );
        })}

        {flow.nodes.map((node, i) => (
          <FlowNode
            key={node.id}
            n={node}
            idx={i}
            runState={runState}
            dragging={draggingId === node.id}
            connecting={Boolean(connecting && connecting.fromId !== node.id && connecting.hoverId === node.id)}
            onMouseDown={(event) => handleNodeMouseDown(event, node)}
            onPortDown={handlePortMouseDown}
            onDelete={() => onDeleteNode?.(node.id)}
            onPromptChange={onPromptChange}
          />
        ))}

        {connecting && (
          <svg className="fc-edges fc-edges-overlay" width={W} height={H}>
            <path d={ghostPath()} className="fc-edge fc-edge-ghost" />
          </svg>
        )}

        {building && (
          <div className="fc-scrim">
            <div className="fc-build-msg">
              <span className="fc-spinner" />
              <span>Generating flow…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
