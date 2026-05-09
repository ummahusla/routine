import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { NODE_W } from "../data/constants";
import { nodePos, edgePath, CANVAS_PAD_X, CANVAS_PAD_Y } from "../utils/flow";
import { FlowNode } from "./FlowNode";
import { NodePalette } from "./NodePalette";
import type { Flow, FlowNode as FlowNodeModel, PaletteItem, RunState } from "../types";

type DragState = {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
};

type FlowCanvasProps = {
  flow: Flow | null;
  runState: RunState;
  building: boolean;
  focusId?: string | null;
  onFocus?: (id: string) => void;
  onMoveNode?: (id: string, x: number, y: number) => void;
  onDeleteNode?: (id: string) => void;
  onAddNode?: (item: PaletteItem) => void;
};

export function FlowCanvas({
  flow,
  runState,
  building,
  onFocus,
  onMoveNode,
  onDeleteNode,
  onAddNode,
}: FlowCanvasProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);

  if (!flow) return null;
  const nodeMap = Object.fromEntries(flow.nodes.map((node) => [node.id, node])) as Record<string, FlowNodeModel>;

  const maxX = Math.max(...flow.nodes.map((node) => nodePos(node).x + NODE_W));
  const maxY = Math.max(...flow.nodes.map((node) => nodePos(node).y + 64));
  const W = Math.max(maxX + CANVAS_PAD_X, 800);
  const H = Math.max(maxY + CANVAS_PAD_Y, 320);

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

  return (
    <div className="fc-wrap">
      <div className="fc-toolbar">
        <button className="fc-tb-btn" onClick={() => setPaletteOpen((open) => !open)}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add step
        </button>
        {paletteOpen && (
          <NodePalette
            onPick={(spec) => {
              setPaletteOpen(false);
              onAddNode?.(spec);
            }}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </div>

      <div className="fc-canvas" style={{ width: W, height: H }}>
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
            const revealStyle: CSSProperties =
              !fromNode._userPlaced && !toNode._userPlaced
                ? { animationDelay: `${(i + 2) * 50}ms` }
                : { animation: "none", opacity: 1 };
            return (
              <path
                key={`${from}-${to}-${i}`}
                d={edgePath(fromNode, toNode)}
                className={`fc-edge ${active ? "is-active" : ""}`}
                markerEnd="url(#fc-arrow)"
                style={revealStyle}
              />
            );
          })}
        </svg>

        {flow.nodes.map((node, i) => (
          <FlowNode
            key={node.id}
            n={node}
            idx={i}
            runState={runState}
            dragging={draggingId === node.id}
            onMouseDown={(event) => handleNodeMouseDown(event, node)}
            onDelete={() => onDeleteNode?.(node.id)}
          />
        ))}

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
