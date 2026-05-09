import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { topoLayers } from "./utils/flow";
import { flowbuilderStateToFlow } from "./utils/flowbuilder";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { FlowCanvas } from "./components/FlowCanvas";
import { FlowLegend } from "./components/FlowLegend";
import { NodeInspector } from "./components/NodeInspector";
import type { Flow, FlowbuilderManifest, FlowbuilderSessionSummary, RunState } from "./types";

// Static design constants (replaces the previous tweakable values)
const ACCENT = "#5fc88f";
const DENSITY = "regular" as const;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseDir, setBaseDir] = useState("");
  const [manifest, setManifest] = useState<FlowbuilderManifest | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [runState, setRunState] = useState<RunState>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadSessions = useCallback(async (preferredId?: string | null): Promise<void> => {
    setLoadingSessions(true);
    setError(null);

    try {
      const result = await window.api.flowbuilder.listSessions();
      setBaseDir(result.baseDir);

      if (!result.ok) {
        setSessions([]);
        setSelectedId(null);
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
      setSelectedId(nextId);
      if (!nextId) {
        setFlow(null);
        setManifest(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown flowbuilder session list error");
      setSessions([]);
      setSelectedId(null);
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
    if (!selectedId) return;

    let cancelled = false;
    setLoadingSession(true);
    setBuilding(true);
    setError(null);
    setFlow(null);
    setManifest(null);
    setFocusId(null);
    setRunState({});

    window.api.flowbuilder
      .readSession(selectedId)
      .then((result) => {
        if (cancelled) return;
        setBaseDir(result.baseDir);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setManifest(result.manifest);
        setFlow(flowbuilderStateToFlow(result.manifest, result.state));
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
  }, [selectedId, reloadKey]);

  function handleSelect(id: string): void {
    if (id === selectedId) return;
    setSelectedId(id);
  }

  function handleRefresh(): void {
    void loadSessions(selectedId);
    if (selectedId) setReloadKey((current) => current + 1);
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

  return (
    <div className={`app density-${DENSITY}`} style={{ "--accent": ACCENT } as CSSProperties}>
      <Sidebar
        sessions={sessions}
        selectedId={selectedId}
        loading={loadingSessions}
        error={error}
        baseDir={baseDir}
        onSelect={handleSelect}
        onRefresh={handleRefresh}
      />

      <main className="main">
        <TopBar flow={flow} onHome={handleRefresh} onTidy={handleTidy} />

        {loadingSessions && (
          <SessionPanel title="Loading sessions" body="Reading flowbuilder sessions from disk." detail={baseDir} />
        )}

        {!loadingSessions && error && (
          <SessionPanel
            title="Could not load flowbuilder state"
            body={error}
            detail={baseDir}
            action={{ label: "Try again", onClick: handleRefresh }}
          />
        )}

        {!loadingSessions && !error && sessions.length === 0 && (
          <SessionPanel
            title="No flowbuilder sessions yet"
            body="The Electron UI reads existing sessions from disk. For local development, point FLOW_BUILD_FLOWBUILDER_BASE at the mock fixture directory."
            detail={baseDir || "FLOW_BUILD_FLOWBUILDER_BASE=mock/flowbuilder pnpm dev"}
            action={{ label: "Refresh sessions", onClick: handleRefresh }}
          />
        )}

        {!loadingSessions && !error && selectedId && (flow || loadingSession) && (
          <div className="chatflow chatflow-readonly">
            <div className="cf-stage">
              <div className="session-banner">
                <span>Read-only session</span>
                <strong>{manifest?.id ?? selectedId}</strong>
                {manifest && <span>{new Date(manifest.updatedAt).toLocaleString()}</span>}
              </div>
              {loadingSession && !flow ? (
                <SessionPanel title="Loading session" body="Reading manifest and state from disk." detail={selectedId} />
              ) : flow && flow.nodes.length === 0 ? (
                <SessionPanel
                  title="Empty session"
                  body="This session has a valid state file, but it does not contain any nodes yet."
                  detail={manifest?.id}
                />
              ) : (
                <div className="cf-canvas-wrap">
                  <FlowCanvas flow={flow} runState={runState} building={building} focusId={focusId} onFocus={setFocusId} />
                </div>
              )}
              {flow && flow.nodes.length > 0 && <FlowLegend />}
            </div>
          </div>
        )}

        {focusId && flow && (
          <NodeInspector
            node={flow.nodes.find((node) => node.id === focusId)}
            status={runState[focusId]}
            readOnly
            onClose={() => setFocusId(null)}
          />
        )}
      </main>
    </div>
  );
}
