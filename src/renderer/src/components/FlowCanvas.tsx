import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { NODE_W, NODE_H } from "../data/constants";
import { nodePos, edgePath } from "../utils/flow";
import { FlowNode } from "./FlowNode";
import type { Flow, FlowNode as FlowNodeModel, RunState } from "../types";

// Generous pan margin so the user can drag the background past the content
// in any direction; floor of 4000×2000 keeps a roomy canvas even for tiny flows.
const PAN_MARGIN_X = 2400;
const PAN_MARGIN_Y = 1200;
const MIN_CANVAS_W = 4000;
const MIN_CANVAS_H = 2000;

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
  onPromptChange?: (id: string, prompt: string) => void;
};

export function FlowCanvas({
  flow,
  runState,
  building,
  onFocus,
  onMoveNode,
  onDeleteNode,
  onPromptChange,
}: FlowCanvasProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);

  if (!flow) return null;
  const nodeMap = Object.fromEntries(flow.nodes.map((node) => [node.id, node])) as Record<string, FlowNodeModel>;

  const maxX = Math.max(...flow.nodes.map((node) => nodePos(node).x + NODE_W));
  const maxY = Math.max(...flow.nodes.map((node) => nodePos(node).y + NODE_H));
  const W = Math.max(maxX + PAN_MARGIN_X, MIN_CANVAS_W);
  const H = Math.max(maxY + PAN_MARGIN_Y, MIN_CANVAS_H);

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

  // Pan only via middle mouse button; left-click on the background does
  // nothing (so it doesn't hijack text-input focus or node deselect).
  function handleBgMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.button !== 1) return;
    if ((event.target as HTMLElement).closest(".fc-node")) return;
    event.preventDefault();
    const scroller = document.querySelector<HTMLElement>(".cf-canvas-wrap");
    if (!scroller) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollX = scroller.scrollLeft;
    const startScrollY = scroller.scrollTop;
    document.body.style.cursor = "grabbing";
    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      scroller.scrollLeft = startScrollX - (moveEvent.clientX - startX);
      scroller.scrollTop = startScrollY - (moveEvent.clientY - startY);
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="fc-wrap">
      <div className="fc-canvas" style={{ width: W, height: H }} onMouseDown={handleBgMouseDown}>
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
            onPromptChange={onPromptChange}
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
