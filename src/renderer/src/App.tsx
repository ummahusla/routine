import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { FLOW_TEMPLATES, matchTemplate } from "./data/flowTemplates";
import { NODE_W, NODE_H, GAP_X } from "./data/constants";
import { cloneFlow, topoLayers, nodePos } from "./utils/flow";
import { flowbuilderStateToFlow } from "./utils/flowbuilder";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { EmptyState } from "./components/EmptyState";
import { ChatThread } from "./components/ChatThread";
import { FlowCanvas } from "./components/FlowCanvas";
import { FlowLegend } from "./components/FlowLegend";
import { NodeInspector } from "./components/NodeInspector";
import { PromptBox } from "./components/PromptBox";
import type {
  ChatMessage,
  Flow,
  FlowEdge,
  FlowNode,
  FlowTemplateId,
  FlowbuilderManifest,
  FlowbuilderSessionSummary,
  PaletteItem,
  RunState,
} from "./types";

// Static design constants (replaces the previous tweakable values)
const ACCENT = "#5fc88f";
const DENSITY = "regular" as const;

const SMART_ADD_ITEMS = {
  prompt: {
    type: "prompt",
    icon: "llm",
    label: "Prompt block",
    sub: "editable",
    prompt: "You are a helpful assistant. {{ input }}",
  },
  slack: { type: "output", icon: "slack", label: "Slack message", sub: "#channel" },
  email: { type: "output", icon: "mail", label: "Send email", sub: "smtp" },
  webhook: { type: "trigger", icon: "webhook", label: "Webhook", sub: "POST /event" },
  http: { type: "http", icon: "http", label: "HTTP request", sub: "GET /..." },
  llm: { type: "llm", icon: "llm", label: "LLM call", sub: "claude-sonnet" },
  filter: { type: "filter", icon: "filter", label: "Filter", sub: "where ..." },
  approval: { type: "human", icon: "user", label: "Human approval", sub: "slack approval" },
  database: { type: "storage", icon: "db", label: "Database", sub: "supabase · query" },
  spreadsheet: { type: "storage", icon: "sheet", label: "Spreadsheet", sub: "google sheets" },
  schedule: { type: "trigger", icon: "schedule", label: "Schedule", sub: "every day · 09:00" },
  transform: { type: "transform", icon: "transform", label: "Transform", sub: "map · reduce" },
  code: { type: "transform", icon: "code", label: "Code", sub: "javascript" },
} satisfies Record<string, PaletteItem>;

function SessionPanel({
  title,
  body,
  detail,
  action,
}: {
  title: string;
  body: string;
  detail?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}) {
  return (
    <div className="session-empty">
      <div className="empty-mark">
        <svg viewBox="0 0 40 40" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="14" width="10" height="12" rx="3" />
          <rect x="27" y="6" width="10" height="12" rx="3" />
          <rect x="27" y="22" width="10" height="12" rx="3" />
          <path d="M13 20h7M20 20v-8h7M20 20v8h7" />
        </svg>
      </div>
      <h1 className="empty-h">{title}</h1>
      <p className="empty-sub">{body}</p>
      {detail && <code className="session-path">{detail}</code>}
      {action && (
        <button className="session-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function App() {
  const [sessions, setSessions] = useState<FlowbuilderSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [localFlowId, setLocalFlowId] = useState<FlowTemplateId | null>(null);
  const [baseDir, setBaseDir] = useState("");
  const [manifest, setManifest] = useState<FlowbuilderManifest | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<RunState>({});
  const [refineVal, setRefineVal] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [chatHeight, setChatHeight] = useState(180);
  const [reloadKey, setReloadKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("flowbuild:sidebarCollapsed") === "1";
  });
  const [narrowViewport, setNarrowViewport] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < 820,
  );
  const stopRef = useRef(false);

  const isRail = sidebarCollapsed || narrowViewport;

  useEffect(() => {
    function onResize(): void {
      setNarrowViewport(window.innerWidth < 820);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleToggleSidebar = useCallback((): void => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("flowbuild:sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  const readOnlySession = Boolean(selectedSessionId);

  const loadSessions = useCallback(async (preferredId?: string | null): Promise<void> => {
    setLoadingSessions(true);
    setError(null);

    try {
      const result = await window.api.flowbuilder.listSessions();
      setBaseDir(result.baseDir);

      if (!result.ok) {
        setSessions([]);
        setSelectedSessionId(null);
        setFlow(null);
        setManifest(null);
        setError(result.error);
        return;
      }

      setSessions(result.sessions);
      const nextId =
        preferredId && result.sessions.some((session) => session.id === preferredId)
          ? preferredId
          : (result.sessions[0]?.id ?? null);
      setSelectedSessionId(nextId);
      if (!nextId) {
        setFlow(null);
        setManifest(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown flowbuilder session list error");
      setSessions([]);
      setSelectedSessionId(null);
      setFlow(null);
      setManifest(null);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) return;

    let cancelled = false;
    setLoadingSession(true);
    setBuilding(true);
    setError(null);
    setFlow(null);
    setManifest(null);
    setFocusId(null);
    setRunState({});
    setLocalFlowId(null);

    window.api.flowbuilder
      .readSession(selectedSessionId)
      .then((result) => {
        if (cancelled) return;
        setBaseDir(result.baseDir);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setManifest(result.manifest);
        setFlow(flowbuilderStateToFlow(result.manifest, result.state));
        setMessages([
          { role: "user", text: `Open flowbuilder session: ${result.manifest.name}` },
          {
            role: "ai",
            text: `${result.manifest.description || "Loaded flowbuilder session from disk."} This graph is read-only in the UI, but you can still chat about it here.`,
          },
        ]);
      })
      .catch((readError: unknown) => {
        if (cancelled) return;
        setError(readError instanceof Error ? readError.message : "Unknown flowbuilder session read error");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSession(false);
        setBuilding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, reloadKey]);

  function handleSelect(id: string): void {
    if (id === selectedSessionId) return;
    setSelectedSessionId(id);
  }

  function handleRefresh(): void {
    void loadSessions(selectedSessionId);
    if (selectedSessionId) setReloadKey((current) => current + 1);
  }

  function handleNew(): void {
    setSelectedSessionId(null);
    setLocalFlowId(null);
    setManifest(null);
    setFlow(null);
    setBuilding(false);
    setRunning(false);
    setRunState({});
    setMessages([]);
    setFocusId(null);
    setError(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        handleNew();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit(text: string): void {
    const tplId = matchTemplate(text);
    const tpl = FLOW_TEMPLATES[tplId];
    setMessages((current) => [...current, { role: "user", text }]);
    setSelectedSessionId(null);
    setLocalFlowId(tplId);
    setManifest(null);
    setBuilding(true);
    setRunState({});
    setFlow(null);

    window.setTimeout(() => {
      setFlow(cloneFlow(tpl));
      setBuilding(false);
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: tpl.summary,
          steps: [
            `Identified ${tpl.nodes.length} steps and ${tpl.edges.length} connections`,
            `Mapped to ${new Set(tpl.nodes.map((node) => node.type)).size} node types in your workspace`,
            `Connectors are configured · ready to execute`,
          ],
        },
      ]);
    }, 900);
  }

  // Re-run the auto-layout: drop any user-set x/y coordinates and recompute
  // each node's column (topological layer) and row (in-layer index).
  function handleTidy(): void {
    setFlow((current) => {
      if (!current) return current;
      const layers = topoLayers(current);
      const placed = new Set<string>(layers.flat());
      const orphans = current.nodes.filter((n) => !placed.has(n.id)).map((n) => n.id);
      if (orphans.length) layers.push(orphans);
      const layerOf: Record<string, number> = {};
      const rowOf: Record<string, number> = {};
      layers.forEach((ids, ci) => ids.forEach((id, ri) => {
        layerOf[id] = ci;
        rowOf[id] = ri;
      }));
      return {
        ...current,
        nodes: current.nodes.map((node) => {
          const { x: _x, y: _y, _userPlaced: _placed, ...rest } = node;
          return { ...rest, col: layerOf[node.id] ?? 0, row: rowOf[node.id] ?? 0 };
        }),
      };
    });
  }

  async function handleRun(): Promise<void> {
    if (!flow || running || readOnlySession) return;
    stopRef.current = false;
    setRunning(true);
    const layers = topoLayers(flow);
    const seed: RunState = Object.fromEntries(flow.nodes.map((node) => [node.id, "pending"]));
    setRunState(seed);

    for (const layer of layers) {
      if (stopRef.current) break;
      setRunState((state) => {
        const next: RunState = { ...state };
        layer.forEach((id) => (next[id] = "running"));
        return next;
      });
      requestAnimationFrame(() => scrollToNodes(layer));
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      if (stopRef.current) break;
      setRunState((state) => {
        const next: RunState = { ...state };
        layer.forEach((id) => (next[id] = "done"));
        return next;
      });
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }

    setRunning(false);
  }

  function scrollToNodes(ids: string[]): void {
    const wrap = document.querySelector<HTMLElement>(".cf-canvas-wrap");
    if (!wrap || !flow) return;
    const targets = flow.nodes.filter((node) => ids.includes(node.id));
    if (!targets.length) return;

    const xs = targets.map((node) => nodePos(node).x);
    const ys = targets.map((node) => nodePos(node).y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + NODE_H;
    const padOuter = 16;
    const cx = padOuter + (minX + maxX) / 2;
    const cy = padOuter + (minY + maxY) / 2;

    wrap.scrollTo({
      left: Math.max(0, cx - wrap.clientWidth / 2),
      top: Math.max(0, cy - wrap.clientHeight / 2),
      behavior: "smooth",
    });
  }

  function handleStop(): void {
    stopRef.current = true;
    setRunning(false);
  }

  function handleReset(): void {
    setRunState({});
  }

  function handleMoveNode(id: string, x: number, y: number): void {
    if (readOnlySession) return;
    setFlow((current) =>
      current && {
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, x, y, _userPlaced: true } : node)),
      },
    );
  }

  function handleDeleteNode(id: string): void {
    if (readOnlySession) return;
    setFlow((current) => {
      if (!current) return current;

      const predecessors = current.edges.filter(([, to]) => to === id).map(([from]) => from);
      const successors = current.edges.filter(([from]) => from === id).map(([, to]) => to);
      const remaining = current.edges.filter(([from, to]) => from !== id && to !== id);
      const existing = new Set(remaining.map(([from, to]) => `${from}>${to}`));
      const bridges: FlowEdge[] = [];

      for (const from of predecessors) {
        for (const to of successors) {
          if (from !== to && !existing.has(`${from}>${to}`)) {
            bridges.push([from, to]);
            existing.add(`${from}>${to}`);
          }
        }
      }

      return {
        ...current,
        nodes: current.nodes.filter((node) => node.id !== id),
        edges: [...remaining, ...bridges],
      };
    });
    setRunState((state) => {
      const next = { ...state };
      delete next[id];
      return next;
    });
    if (focusId === id) setFocusId(null);
  }

  function handleAddNode(spec: PaletteItem): void {
    if (readOnlySession) return;
    setFlow((current) => {
      if (!current) return current;
      const rightmost = current.nodes.reduce(
        (max, node) => {
          const pos = nodePos(node);
          return pos.x > max.x ? pos : max;
        },
        { x: 0, y: 80 },
      );
      const newId = `u${Date.now().toString(36)}`;
      const newNode: FlowNode = {
        id: newId,
        type: spec.type,
        icon: spec.icon,
        label: spec.label,
        sub: spec.sub,
        x: rightmost.x + NODE_W + GAP_X,
        y: rightmost.y,
        col: 0,
        row: 0,
        _userPlaced: true,
        ...(spec.prompt != null ? { prompt: spec.prompt } : {}),
      };
      const sourceNode = current.nodes.find((node) => {
        const pos = nodePos(node);
        return pos.x === rightmost.x && pos.y === rightmost.y;
      });
      const newEdges: FlowEdge[] = sourceNode ? [...current.edges, [sourceNode.id, newId]] : current.edges;
      return { ...current, nodes: [...current.nodes, newNode], edges: newEdges };
    });
  }

  function handleDeleteEdge(from: string, to: string): void {
    if (readOnlySession) return;
    setFlow((current) =>
      current && {
        ...current,
        edges: current.edges.filter(([a, b]) => !(a === from && b === to)),
      },
    );
  }

  function handleAddEdge(from: string, to: string): void {
    if (readOnlySession || !from || !to || from === to) return;
    setFlow((current) => {
      if (!current) return current;
      if (current.edges.some(([a, b]) => a === from && b === to)) return current;
      const adj: Record<string, string[]> = {};
      current.edges.forEach(([a, b]) => {
        (adj[a] ||= []).push(b);
      });
      const seen = new Set<string>();
      const stack = [to];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === from) return current;
        if (seen.has(cur)) continue;
        seen.add(cur);
        (adj[cur] || []).forEach((next) => stack.push(next));
      }
      return { ...current, edges: [...current.edges, [from, to]] };
    });
  }

  function handlePromptChange(id: string, prompt: string): void {
    if (readOnlySession) return;
    setFlow((current) =>
      current && {
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, prompt } : node)),
      },
    );
  }

  function buildCursorChatPrompt(userPrompt: string): string {
    const flowContext = flow
      ? {
          title: flow.title,
          summary: flow.summary,
          source: readOnlySession ? "flowbuilder session on disk (read-only)" : "local editable chat flow",
          nodes: flow.nodes.map(({ id, type, label, sub, col, row, prompt }) => ({
            id,
            type,
            label,
            sub,
            col,
            row,
            ...(prompt ? { prompt } : {}),
          })),
          edges: flow.edges,
        }
      : null;
    const recentMessages = messages.slice(-6).map(({ role, text }) => ({ role, text }));

    return `You are FlowBuild's flow design copilot inside an Electron app.

The user is chatting about the current visual automation flow. Help them think through changes to the flow.

Important:
- If the current source is read-only, do not claim the UI can save graph edits; describe what the agent or future writer would change.
- If the current source is local editable chat flow, describe intended UI changes naturally.
- Do not edit files, do not run commands, and do not return JSON yet.

Current flow snapshot:
${JSON.stringify(flowContext, null, 2)}

Recent chat:
${JSON.stringify(recentMessages, null, 2)}

User message:
${userPrompt}`;
  }

  function runCursorChat(prompt: string): void {
    const id = `cursor-${Date.now().toString(36)}`;
    const agentPrompt = buildCursorChatPrompt(prompt);
    setMessages((current) => [...current, { id, role: "ai", text: "", streaming: true }]);

    void window.api.cursorChat
      .send(agentPrompt, (event) => {
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== id || message.role !== "ai") return message;
            if (event.type === "text") return { ...message, text: message.text + event.text };
            if (event.type === "done") return { ...message, streaming: false };
            return { ...message, text: `Cursor SDK error: ${event.error}`, streaming: false };
          }),
        );
      })
      .then((result) => {
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== id || message.role !== "ai") return message;
            if (result.ok) {
              return {
                ...message,
                text: message.text || `Cursor run finished with status: ${result.status}`,
                streaming: false,
              };
            }
            return { ...message, text: `Cursor SDK error: ${result.error}`, streaming: false };
          }),
        );
      })
      .catch((chatError: unknown) => {
        const message = chatError instanceof Error ? chatError.message : "Unknown Cursor SDK error";
        setMessages((current) =>
          current.map((item) =>
            item.id === id && item.role === "ai" ? { ...item, text: `Cursor SDK error: ${message}`, streaming: false } : item,
          ),
        );
      });
  }

  function handleRefine(): void {
    const value = refineVal.trim();
    if (!value) return;

    const lower = value.toLowerCase();
    setMessages((current) => [...current, { role: "user", text: value }]);
    setRefineVal("");

    if (!readOnlySession) {
      if (/\b(run|execute|go|start|kick)\b/.test(lower) && !/stop/.test(lower)) {
        setMessages((current) => [...current, { role: "ai", text: "Executing now — watch the canvas." }]);
        window.setTimeout(() => void handleRun(), 250);
        return;
      }

      if (/\b(stop|cancel|halt|abort)\b/.test(lower)) {
        handleStop();
        setMessages((current) => [...current, { role: "ai", text: "Stopped. Nothing was rolled back." }]);
        return;
      }

      if (/\b(reset|clear)\b/.test(lower)) {
        handleReset();
        setMessages((current) => [...current, { role: "ai", text: "Cleared the run state." }]);
        return;
      }

      const addMatch = lower.match(
        /add (?:a |an )?(prompt|slack|email|webhook|http|llm|filter|approval|database|spreadsheet|schedule|transform|code)/,
      );
      if (addMatch) {
        const kind = addMatch[1] as keyof typeof SMART_ADD_ITEMS;
        const spec = SMART_ADD_ITEMS[kind];
        handleAddNode(spec);
        setMessages((current) => [
          ...current,
          { role: "ai", text: `Added a ${spec.label} step at the end. Drag it where you want it.` },
        ]);
        return;
      }
    }

    runCursorChat(value);
  }

  return (
    <div
      className={`app density-${DENSITY} ${isRail ? "is-rail" : ""}`}
      style={{ "--accent": ACCENT } as CSSProperties}
    >
      <Sidebar
        sessions={sessions}
        selectedId={selectedSessionId}
        localActive={Boolean(localFlowId || (!selectedSessionId && !flow))}
        loading={loadingSessions}
        error={error}
        baseDir={baseDir}
        collapsed={isRail}
        canToggleCollapse={!narrowViewport}
        onToggleCollapse={handleToggleSidebar}
        onSelect={handleSelect}
        onNew={handleNew}
        onRefresh={handleRefresh}
      />

      <main className="main">
        <TopBar flow={flow} onHome={handleNew} onTidy={handleTidy} />

        {!selectedSessionId && !flow && !building && <EmptyState onSubmit={handleSubmit} />}

        {selectedSessionId && loadingSessions && (
          <SessionPanel title="Loading sessions" body="Reading flowbuilder sessions from disk." detail={baseDir} />
        )}

        {selectedSessionId && !loadingSessions && error && (
          <SessionPanel
            title="Could not load flowbuilder state"
            body={error}
            detail={baseDir}
            action={{ label: "Try again", onClick: handleRefresh }}
          />
        )}

        {selectedSessionId && !loadingSessions && !error && sessions.length === 0 && (
          <SessionPanel
            title="No flowbuilder sessions yet"
            body="The Electron UI reads existing sessions from disk. For local development, point FLOW_BUILD_FLOWBUILDER_BASE at the mock fixture directory."
            detail={baseDir || "FLOW_BUILD_FLOWBUILDER_BASE=mock/flowbuilder pnpm dev"}
            action={{ label: "Refresh sessions", onClick: handleRefresh }}
          />
        )}

        {(flow || building || (selectedSessionId && loadingSession)) && !error && (
          <div className={`chatflow ${readOnlySession ? "chatflow-session" : ""}`}>
            <div className="cf-stage">
              {readOnlySession && (
                <div className="session-banner">
                  <span>Read-only graph</span>
                  <strong>{manifest?.id ?? selectedSessionId}</strong>
                  {manifest && <span>{new Date(manifest.updatedAt).toLocaleString()}</span>}
                </div>
              )}
              {readOnlySession && loadingSession && !flow ? (
                <SessionPanel title="Loading session" body="Reading manifest and state from disk." detail={selectedSessionId ?? undefined} />
              ) : flow && flow.nodes.length === 0 ? (
                <SessionPanel
                  title="Empty session"
                  body={
                    readOnlySession
                      ? "This session has a valid state file, but it does not contain any nodes yet."
                      : "Describe the automation below to generate a local editable flow."
                  }
                  detail={manifest?.id}
                />
              ) : (
                <div className="cf-canvas-wrap">
                  <FlowCanvas
                    flow={flow}
                    runState={runState}
                    building={building}
                    focusId={focusId}
                    onFocus={setFocusId}
                    onMoveNode={readOnlySession ? undefined : handleMoveNode}
                    onDeleteNode={readOnlySession ? undefined : handleDeleteNode}
                    onDeleteEdge={readOnlySession ? undefined : handleDeleteEdge}
                    onAddEdge={readOnlySession ? undefined : handleAddEdge}
                    onPromptChange={readOnlySession ? undefined : handlePromptChange}
                  />
                </div>
              )}
              {flow && flow.nodes.length > 0 && <FlowLegend />}
            </div>

            <div className="cf-bottom">
              <ChatThread messages={messages} height={chatHeight} onResize={setChatHeight} />
              <div className="cf-refine">
                <PromptBox
                  value={refineVal}
                  onChange={setRefineVal}
                  onSubmit={handleRefine}
                  placeholder={
                    readOnlySession
                      ? "Chat about this read-only session..."
                      : "Refine the flow... e.g. 'add a Slack approval before sending'"
                  }
                />
              </div>
            </div>
          </div>
        )}

        {focusId && flow && (
          <NodeInspector
            node={flow.nodes.find((node) => node.id === focusId)}
            status={runState[focusId]}
            readOnly={readOnlySession}
            onClose={() => setFocusId(null)}
          />
        )}
      </main>
    </div>
  );
}
