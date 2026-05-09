import { useRef, useState } from "react";
import { NODE_W } from "../data/constants";
import { nodePos, edgePath, CANVAS_PAD_X, CANVAS_PAD_Y } from "../utils/flow";
import { FlowNode } from "./FlowNode";
import { NodePalette } from "./NodePalette";

export function FlowCanvas({ flow, runState, building, onFocus, onMoveNode, onDeleteNode, onAddNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const dragRef = useRef(null);

  if (!flow) return null;
  const nodeMap = Object.fromEntries(flow.nodes.map((n) => [n.id, n]));

  const maxX = Math.max(...flow.nodes.map((n) => nodePos(n).x + NODE_W));
  const maxY = Math.max(...flow.nodes.map((n) => nodePos(n).y + 64));
  const W = Math.max(maxX + CANVAS_PAD_X, 800);
  const H = Math.max(maxY + CANVAS_PAD_Y, 320);

  function handleNodeMouseDown(e, node) {
    if (e.button !== 0) return;
    const { x, y } = nodePos(node);
    dragRef.current = {
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: x,
      origY: y,
      moved: false,
    };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true;
        setDraggingId(d.id);
      }
      if (d.moved) {
        onMoveNode?.(d.id, Math.max(0, d.origX + dx), Math.max(0, d.origY + dy));
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (d && !d.moved) onFocus?.(d.id);
      dragRef.current = null;
      setDraggingId(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="fc-wrap">
      <div className="fc-toolbar">
        <button className="fc-tb-btn" onClick={() => setPaletteOpen((o) => !o)}>
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
          {flow.edges.map(([a, b], i) => {
            const A = nodeMap[a];
            const B = nodeMap[b];
            if (!A || !B) return null;
            const active = runState?.[a] === "done" && runState?.[b];
            return (
              <path
                key={`${a}-${b}-${i}`}
                d={edgePath(A, B)}
                className={`fc-edge ${active ? "is-active" : ""}`}
                markerEnd="url(#fc-arrow)"
                style={
                  !A._userPlaced && !B._userPlaced
                    ? { animationDelay: `${(i + 2) * 50}ms` }
                    : { animation: "none", opacity: 1 }
                }
              />
            );
          })}
        </svg>

        {flow.nodes.map((n, i) => (
          <FlowNode
            key={n.id}
            n={n}
            idx={i}
            runState={runState}
            dragging={draggingId === n.id}
            onMouseDown={(e) => handleNodeMouseDown(e, n)}
            onDelete={() => onDeleteNode?.(n.id)}
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
