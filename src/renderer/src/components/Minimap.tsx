import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { TYPE_COLORS } from "../data/typeColors";
import type { Flow } from "../types";

type DragState = {
  offsetX: number;
  offsetY: number;
  wrapRect: DOMRect;
  elW: number;
  elH: number;
};

type Position = {
  left: number | null;
  top: number | null;
  right: number | null;
  bottom: number | null;
};

const DEFAULT_POS: Position = { right: 16, bottom: 16, left: null, top: null };

type MinimapProps = {
  flow: Flow;
};

export function Minimap({ flow }: MinimapProps) {
  const [pos, setPos] = useState<Position>(DEFAULT_POS);
  const dragRef = useRef<DragState | null>(null);

  const maxCol = Math.max(...flow.nodes.map((node) => node.col));
  const maxRow = Math.max(...flow.nodes.map((node) => node.row));
  const W = 144;
  const H = 80;
  const cw = W / (maxCol + 1);
  const ch = H / (maxRow + 1);

  function onHeaderDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const wrap = document.querySelector<HTMLElement>(".cf-canvas-wrap");
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const el = event.currentTarget.parentElement as HTMLElement | null;
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - elRect.left,
      offsetY: event.clientY - elRect.top,
      wrapRect,
      elW: elRect.width,
      elH: elRect.height,
    };

    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const left = moveEvent.clientX - drag.wrapRect.left - drag.offsetX;
      const top = moveEvent.clientY - drag.wrapRect.top - drag.offsetY;
      const clampedLeft = Math.max(8, Math.min(drag.wrapRect.width - drag.elW - 8, left));
      const clampedTop = Math.max(8, Math.min(drag.wrapRect.height - drag.elH - 8, top));
      setPos({ left: clampedLeft, top: clampedTop, right: null, bottom: null });
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const style: CSSProperties = {
    left: pos.left != null ? pos.left : "auto",
    top: pos.top != null ? pos.top : "auto",
    right: pos.right != null ? pos.right : "auto",
    bottom: pos.bottom != null ? pos.bottom : "auto",
  };

  return (
    <div className="mm" style={style}>
      <div className="mm-h" onMouseDown={onHeaderDown}>
        <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor">
          <circle cx="6" cy="6" r="1.5" />
          <circle cx="12" cy="6" r="1.5" />
          <circle cx="18" cy="6" r="1.5" />
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </svg>
        <span>Overview</span>
      </div>
      <svg width={W} height={H}>
        {flow.edges.map(([from, to], i) => {
          const fromNode = flow.nodes.find((node) => node.id === from);
          const toNode = flow.nodes.find((node) => node.id === to);
          if (!fromNode || !toNode) return null;
          return (
            <line
              key={`${from}-${to}-${i}`}
              x1={fromNode.col * cw + cw / 2}
              y1={fromNode.row * ch + ch / 2}
              x2={toNode.col * cw + cw / 2}
              y2={toNode.row * ch + ch / 2}
              stroke="rgba(200,205,215,0.25)"
              strokeWidth="1"
            />
          );
        })}
        {flow.nodes.map((node) => (
          <rect
            key={node.id}
            x={node.col * cw + 2}
            y={node.row * ch + ch / 2 - 3}
            width={Math.max(8, cw - 4)}
            height={6}
            rx={1.5}
            fill={TYPE_COLORS[node.type].icon}
            opacity="0.85"
          />
        ))}
      </svg>
    </div>
  );
}
