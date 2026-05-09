import { useRef, useState } from "react";
import { FLOW_TEMPLATES, PREVIOUS_FLOWS, SUGGESTED_PROMPTS, matchTemplate } from "./data/flowTemplates";
import { NODE_W, GAP_X } from "./data/constants";
import { cloneFlow, topoLayers, nodePos } from "./utils/flow";

import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { EmptyState } from "./components/EmptyState";
import { ChatThread } from "./components/ChatThread";
import { FlowCanvas } from "./components/FlowCanvas";
import { Minimap } from "./components/Minimap";
import { FlowLegend } from "./components/FlowLegend";
import { NodeInspector } from "./components/NodeInspector";
import { PromptBox } from "./components/PromptBox";

import {
  TweaksPanel,
  TweakSection,
  TweakColor,
  TweakRadio,
  TweakToggle,
  TweakButton,
} from "./components/tweaks/TweaksPanel";
import { useTweaks } from "./components/tweaks/useTweaks";

const TWEAK_DEFAULTS = {
  accent: "#5fc88f",
  showMinimap: true,
  density: "regular",
};

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [selectedId, setSelectedId] = useState(null);
  const [flow, setFlow] = useState(null);
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState({});
  const [refineVal, setRefineVal] = useState("");
  const [messages, setMessages] = useState([]);
  const [focusId, setFocusId] = useState(null);
  const stopRef = useRef(false);

  function handleSubmit(text) {
    const tplId = matchTemplate(text);
    const tpl = FLOW_TEMPLATES[tplId];
    setMessages((m) => [...m, { role: "user", text }]);
    setSelectedId(tplId);
    setBuilding(true);
    setRunState({});
    setFlow(null);

    setTimeout(() => {
      setFlow(cloneFlow(tpl));
      setBuilding(false);
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text: tpl.summary,
          steps: [
            `Identified ${tpl.nodes.length} steps and ${tpl.edges.length} connections`,
            `Mapped to ${new Set(tpl.nodes.map((n) => n.type)).size} node types in your workspace`,
            `Connectors are configured · ready to execute`,
          ],
        },
      ]);
    }, 900);
  }

  function handleSelect(id) {
    const tpl = FLOW_TEMPLATES[id];
    if (!tpl) return;
    setSelectedId(id);
    setFlow(cloneFlow(tpl));
    setBuilding(false);
    setRunning(false);
    setRunState({});
    setMessages([
      { role: "user", text: `Open flow: ${tpl.title}` },
      { role: "ai", text: tpl.summary },
    ]);
  }

  function handleNew() {
    setSelectedId(null);
    setFlow(null);
    setBuilding(false);
    setRunning(false);
    setRunState({});
    setMessages([]);
    setFocusId(null);
  }

  async function handleRun() {
    if (!flow || running) return;
    stopRef.current = false;
    setRunning(true);
    const layers = topoLayers(flow);
    const seed = Object.fromEntries(flow.nodes.map((n) => [n.id, "pending"]));
    setRunState(seed);
    for (const layer of layers) {
      if (stopRef.current) break;
      setRunState((s) => {
        const n = { ...s };
        layer.forEach((id) => (n[id] = "running"));
        return n;
      });
      await new Promise((r) => setTimeout(r, 650));
      if (stopRef.current) break;
      setRunState((s) => {
        const n = { ...s };
        layer.forEach((id) => (n[id] = "done"));
        return n;
      });
      await new Promise((r) => setTimeout(r, 200));
    }
    setRunning(false);
  }

  function handleStop() {
    stopRef.current = true;
    setRunning(false);
  }

  function handleReset() {
    setRunState({});
  }

  function handleMoveNode(id, x, y) {
    setFlow((f) =>
      f && {
        ...f,
        nodes: f.nodes.map((n) => (n.id === id ? { ...n, x, y, _userPlaced: true } : n)),
      }
    );
  }

  function handleDeleteNode(id) {
    setFlow((f) =>
      f && {
        ...f,
        nodes: f.nodes.filter((n) => n.id !== id),
        edges: f.edges.filter(([a, b]) => a !== id && b !== id),
      }
    );
    setRunState((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
    if (focusId === id) setFocusId(null);
  }

  function handleAddNode(spec) {
    setFlow((f) => {
      if (!f) return f;
      const rightmost = f.nodes.reduce(
        (m, n) => {
          const p = nodePos(n);
          return p.x > m.x ? p : m;
        },
        { x: 0, y: 80 }
      );
      const newId = `u${Date.now().toString(36)}`;
      const newNode = {
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
      };
      const sourceNode = f.nodes.find((n) => {
        const p = nodePos(n);
        return p.x === rightmost.x && p.y === rightmost.y;
      });
      const newEdges = sourceNode ? [...f.edges, [sourceNode.id, newId]] : f.edges;
      return { ...f, nodes: [...f.nodes, newNode], edges: newEdges };
    });
  }

  function handleRefine() {
    const v = refineVal.trim();
    if (!v) return;
    setMessages((m) => [...m, { role: "user", text: v }]);
    setRefineVal("");
    setBuilding(true);
    setTimeout(() => {
      const tplId = matchTemplate(v) || selectedId;
      const tpl = FLOW_TEMPLATES[tplId] || flow;
      setFlow(cloneFlow(tpl));
      setSelectedId(tplId);
      setBuilding(false);
      setRunState({});
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text: `Updated. ${tpl.summary}`,
          steps: [`Re-mapped ${tpl.nodes.length} steps`, `Diff applied · 0 breaking changes`],
        },
      ]);
    }, 700);
  }

  return (
    <div className={`app density-${t.density}`} style={{ "--accent": t.accent }}>
      <Sidebar
        flows={PREVIOUS_FLOWS}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
      />

      <main className="main">
        <TopBar
          flow={flow}
          runState={runState}
          building={building}
          running={running}
          onRun={handleRun}
          onStop={handleStop}
          onReset={handleReset}
        />

        {!flow && !building && <EmptyState onSubmit={handleSubmit} suggestions={SUGGESTED_PROMPTS} />}

        {(flow || building) && (
          <div className="chatflow">
            <ChatThread messages={messages} />

            <div className="cf-canvas-wrap">
              <FlowCanvas
                flow={flow}
                runState={runState}
                building={building}
                focusId={focusId}
                onFocus={setFocusId}
                onMoveNode={handleMoveNode}
                onDeleteNode={handleDeleteNode}
                onAddNode={handleAddNode}
              />
              {t.showMinimap && flow && <Minimap flow={flow} />}
              <FlowLegend />
            </div>

            <div className="cf-refine">
              <PromptBox
                value={refineVal}
                onChange={setRefineVal}
                onSubmit={handleRefine}
                placeholder="Refine the flow… e.g. 'add a Slack approval before sending'"
              />
            </div>
          </div>
        )}

        {focusId && flow && (
          <NodeInspector
            node={flow.nodes.find((n) => n.id === focusId)}
            status={runState[focusId]}
            onClose={() => setFocusId(null)}
          />
        )}
      </main>

      <TweaksPanel>
        <TweakSection label="Canvas" />
        <TweakColor
          label="Accent"
          value={t.accent}
          options={["#5fc88f", "#6b8cef", "#e3a857", "#c4a5f0"]}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["compact", "regular"]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakToggle
          label="Show minimap"
          value={t.showMinimap}
          onChange={(v) => setTweak("showMinimap", v)}
        />
        <TweakSection label="Quick actions" />
        <TweakButton
          label="Trigger build"
          onClick={() => handleSubmit("Daily digest of GitHub trending repos to my team's email")}
        />
        <TweakButton label="Run current flow" onClick={handleRun} />
        <TweakButton label="Reset run state" onClick={handleReset} />
      </TweaksPanel>
    </div>
  );
}
