import type { JSX } from "react";

type Props = { name: string };

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  width: 12,
  height: 12,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ToolIcon({ name }: Props): JSX.Element {
  const key = name.toLowerCase();

  if (key === "read") {
    return (
      <svg {...SVG_PROPS} aria-label="Read">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    );
  }
  if (key === "write") {
    return (
      <svg {...SVG_PROPS} aria-label="Write">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M12 18v-6M9 15h6" />
      </svg>
    );
  }
  if (key === "edit" || key === "multiedit") {
    return (
      <svg {...SVG_PROPS} aria-label="Edit">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    );
  }
  if (key === "bash" || key === "shell") {
    return (
      <svg {...SVG_PROPS} aria-label="Bash">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    );
  }
  if (key === "grep") {
    return (
      <svg {...SVG_PROPS} aria-label="Grep">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </svg>
    );
  }
  if (key === "glob") {
    return (
      <svg {...SVG_PROPS} aria-label="Glob">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <circle cx="13" cy="13" r="2.5" />
        <line x1="15" y1="15" x2="17" y2="17" />
      </svg>
    );
  }
  if (key === "webfetch" || key === "websearch" || key === "fetch") {
    return (
      <svg {...SVG_PROPS} aria-label="Web">
        <circle cx="12" cy="12" r="9" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  }
  if (key === "todowrite") {
    return (
      <svg {...SVG_PROPS} aria-label="Todo">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9l2 2 4-4" />
        <line x1="13" y1="14" x2="17" y2="14" />
        <line x1="8" y1="18" x2="17" y2="18" />
      </svg>
    );
  }
  if (key === "task" || key === "agent") {
    return (
      <svg {...SVG_PROPS} aria-label="Agent">
        <rect x="4" y="7" width="16" height="12" rx="2" />
        <path d="M12 7V3" />
        <circle cx="9" cy="13" r="1" />
        <circle cx="15" cy="13" r="1" />
        <line x1="12" y1="3" x2="12" y2="3" />
      </svg>
    );
  }
  if (key === "notebookedit") {
    return (
      <svg {...SVG_PROPS} aria-label="Notebook">
        <path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </svg>
    );
  }
  if (key === "read" || key === "ls") {
    return (
      <svg {...SVG_PROPS} aria-label="List">
        <line x1="8" y1="6" x2="20" y2="6" />
        <line x1="8" y1="12" x2="20" y2="12" />
        <line x1="8" y1="18" x2="20" y2="18" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </svg>
    );
  }
  return (
    <svg {...SVG_PROPS} aria-label="Tool">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z" />
    </svg>
  );
}
