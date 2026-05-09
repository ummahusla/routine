import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
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
  groupIds: string[];
  origPositions: Record<string, { x: number; y: number }>;
  moved: boolean;
};

type Marquee = { x: number; y: number; w: number; h: number };

function nodeHeight(node: FlowNodeModel): number {
  return node.type === "prompt" ? PROMPT_NODE_H : NODE_H;
}

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
  nodeStreams?: Map<string, string>;
  nodeErrors?: Map<string, string>;
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
  nodeStreams,
  nodeErrors,
}: FlowCanvasProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const readOnly = !onMoveNode && !onDeleteNode && !onDeleteEdge && !onAddEdge && !onPromptChange;

  // Esc clears the current selection.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setSelectedIds(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!flow) return null;
  const nodeMap = Object.fromEntries(flow.nodes.map((node) => [node.id, node])) as Record<string, FlowNodeModel>;

  const maxX = Math.max(...flow.nodes.map((node) => nodePos(node).x + NODE_W));
  const maxY = Math.max(...flow.nodes.map((node) => nodePos(node).y + NODE_H));
  const W = maxX + PAD_X;
  const H = maxY + PAD_Y;

  function handlePortMouseDown(event: MouseEvent<HTMLDivElement>, node: FlowNodeModel): void {
    if (!onAddEdge) return;
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
    if (!onMoveNode) {
      if (event.shiftKey) {
        const next = new Set(selectedIds);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        setSelectedIds(next);
      } else {
        setSelectedIds(new Set([node.id]));
        onFocus?.(node.id);
      }
      return;
    }
    const currentFlow = flow;
    if (!currentFlow) return;
    const { x, y } = nodePos(node);

    // Shift-click toggles the node in/out of the selection. A non-shift
    // click on a node that isn't already selected collapses the selection
    // to just that node; if it IS already selected, leave selection alone
    // so the drag moves the whole group.
    let activeSelection = selectedIds;
    if (event.shiftKey) {
      const next = new Set(selectedIds);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      setSelectedIds(next);
      activeSelection = next;
    } else if (!selectedIds.has(node.id)) {
      activeSelection = new Set([node.id]);
      setSelectedIds(activeSelection);
    }

    const groupIds = activeSelection.has(node.id) ? [...activeSelection] : [node.id];
    const origPositions: Record<string, { x: number; y: number }> = {};
    groupIds.forEach((id) => {
      const n = nodeMap[id];
      if (n) origPositions[id] = nodePos(n);
    });

    dragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: x,
      origY: y,
      groupIds,
      origPositions,
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
      if (!drag.moved) return;

      // Primary node's tentative new position.
      let nx = Math.max(0, drag.origX + dx);
      let ny = Math.max(0, drag.origY + dy);

      // Shift-snap: align the node so the line to its nearest connected
      // neighbour is straight on whichever axis is closer. Only kicks in
      // when dragging a single node — multi-select drag is purely free-move.
      if (moveEvent.shiftKey && drag.groupIds.length === 1 && currentFlow) {
        const neighbours: FlowNodeModel[] = [];
        currentFlow.edges.forEach(([a, b]) => {
          if (a === node.id && nodeMap[b]) neighbours.push(nodeMap[b]);
          else if (b === node.id && nodeMap[a]) neighbours.push(nodeMap[a]);
        });
        const myH = nodeHeight(node);
        const myCenterY = ny + myH / 2;
        const myCenterX = nx + NODE_W / 2;
        type SnapCandidate = { x: number; y: number; dist: number };
        let best: SnapCandidate | null = null;
        neighbours.forEach((nb) => {
          const nbPos = nodePos(nb);
          const nbH = nodeHeight(nb);
          const nbCenterY = nbPos.y + nbH / 2;
          const nbCenterX = nbPos.x + NODE_W / 2;
          const candidates: SnapCandidate[] = [
            { x: nx, y: nbCenterY - myH / 2, dist: Math.abs(myCenterY - nbCenterY) },
            { x: nbCenterX - NODE_W / 2, y: ny, dist: Math.abs(myCenterX - nbCenterX) },
          ];
          candidates.forEach((c) => {
            if (!best || c.dist < best.dist) best = c;
          });
        });
        if (best) {
          const winner = best as SnapCandidate;
          nx = Math.max(0, winner.x);
          ny = Math.max(0, winner.y);
        }
      }

      // Apply the resolved delta to every node in the drag group.
      const realDx = nx - drag.origX;
      const realDy = ny - drag.origY;
      drag.groupIds.forEach((id) => {
        const o = drag.origPositions[id];
        if (!o) return;
        onMoveNode?.(id, Math.max(0, o.x + realDx), Math.max(0, o.y + realDy));
      });
    };

    const onUp = (): void => {
      const drag = dragRef.current;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Treat a no-drag click as "open inspector" — but only when the
      // user wasn't shift-clicking (which is purely a selection gesture).
      if (drag && !drag.moved && !event.shiftKey) onFocus?.(drag.id);
      dragRef.current = null;
      setDraggingId(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Middle-mouse pans the canvas. Left-click on empty space draws a
  // rubber-band selection. Both skip nodes / ports / edge controls.
  function handleBgMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).closest(".fc-node, .fc-edge-hit, .fc-edge-del, .fc-palette")) return;

    if (event.button === 1) {
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
      return;
    }

    if (event.button !== 0) return;
    event.preventDefault();
    const canvasEl = canvasRef.current;
    const currentFlow = flow;
    if (!canvasEl || !currentFlow) return;
    const rect = canvasEl.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    const baseSelection = event.shiftKey ? new Set(selectedIds) : new Set<string>();
    if (!event.shiftKey) setSelectedIds(new Set());
    setMarquee({ x: startX, y: startY, w: 0, h: 0 });
    let moved = false;

    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      const r = canvasEl.getBoundingClientRect();
      const cx = moveEvent.clientX - r.left;
      const cy = moveEvent.clientY - r.top;
      const dx = cx - startX;
      const dy = cy - startY;
      if (!moved && Math.hypot(dx, dy) > 3) moved = true;
      const box: Marquee = {
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        w: Math.abs(dx),
        h: Math.abs(dy),
      };
      setMarquee(box);
      const next = new Set(baseSelection);
      currentFlow.nodes.forEach((n) => {
        const p = nodePos(n);
        const h = nodeHeight(n);
        const overlaps =
          p.x < box.x + box.w &&
          p.x + NODE_W > box.x &&
          p.y < box.y + box.h &&
          p.y + h > box.y;
        if (overlaps) next.add(n.id);
      });
      setSelectedIds(next);
    };

    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setMarquee(null);
      // A bare click (no drag) on the background clears selection.
      if (!moved && !event.shiftKey) setSelectedIds(new Set());
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
    <div className={`fc-wrap ${readOnly ? "is-readonly" : ""}`} onMouseDown={handleBgMouseDown}>
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
                {onDeleteEdge && (
                  <path
                    d={d}
                    className="fc-edge-hit"
                    onMouseEnter={() => setHoverEdge(key)}
                    onMouseLeave={() => setHoverEdge((current) => (current === key ? null : current))}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {onDeleteEdge && flow.edges.map(([from, to], i) => {
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
            selected={selectedIds.has(node.id)}
            onMouseDown={(event) => handleNodeMouseDown(event, node)}
            onPortDown={onAddEdge ? handlePortMouseDown : undefined}
            onDelete={onDeleteNode ? () => onDeleteNode(node.id) : undefined}
            onPromptChange={onPromptChange}
            streamingText={nodeStreams?.get(node.id)}
            errorMessage={nodeErrors?.get(node.id)}
          />
        ))}

        {connecting && (
          <svg className="fc-edges fc-edges-overlay" width={W} height={H}>
            <path d={ghostPath()} className="fc-edge fc-edge-ghost" />
          </svg>
        )}

        {marquee && (
          <div
            className="fc-marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
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
