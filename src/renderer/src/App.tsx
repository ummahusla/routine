import { useRef, useState, type CSSProperties } from "react";
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
import type { ChatMessage, Flow, FlowEdge, FlowNode, FlowTemplateId, PaletteItem, RunState, TweakSettings } from "./types";

const TWEAK_DEFAULTS: TweakSettings = {
  accent: "#5fc88f",
  showMinimap: true,
  density: "regular",
};

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [selectedId, setSelectedId] = useState<FlowTemplateId | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<RunState>({});
  const [refineVal, setRefineVal] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const stopRef = useRef(false);

  function handleSubmit(text: string): void {
    const tplId = matchTemplate(text);
    const tpl = FLOW_TEMPLATES[tplId];
    setMessages((current) => [...current, { role: "user", text }]);
    setSelectedId(tplId);
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

  function handleSelect(id: FlowTemplateId): void {
    const tpl = FLOW_TEMPLATES[id];
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

  function handleNew(): void {
    setSelectedId(null);
    setFlow(null);
    setBuilding(false);
    setRunning(false);
    setRunState({});
    setMessages([]);
    setFocusId(null);
  }

  async function handleRun(): Promise<void> {
    if (!flow || running) return;
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

  function handleStop(): void {
    stopRef.current = true;
    setRunning(false);
  }

  function handleReset(): void {
    setRunState({});
  }

  function handleMoveNode(id: string, x: number, y: number): void {
    setFlow((current) =>
      current && {
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, x, y, _userPlaced: true } : node)),
      },
    );
  }

  function handleDeleteNode(id: string): void {
    setFlow((current) =>
      current && {
        ...current,
        nodes: current.nodes.filter((node) => node.id !== id),
        edges: current.edges.filter(([from, to]) => from !== id && to !== id),
      },
    );
    setRunState((state) => {
      const next = { ...state };
      delete next[id];
      return next;
    });
    if (focusId === id) setFocusId(null);
  }

  function handleAddNode(spec: PaletteItem): void {
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
      };
      const sourceNode = current.nodes.find((node) => {
        const pos = nodePos(node);
        return pos.x === rightmost.x && pos.y === rightmost.y;
      });
      const newEdges: FlowEdge[] = sourceNode ? [...current.edges, [sourceNode.id, newId]] : current.edges;
      return { ...current, nodes: [...current.nodes, newNode], edges: newEdges };
    });
  }

  function handleRefine(): void {
    const value = refineVal.trim();
    if (!value) return;
    setMessages((current) => [...current, { role: "user", text: value }]);
    setRefineVal("");
    setBuilding(true);
    window.setTimeout(() => {
      const tplId = matchTemplate(value);
      const tpl = FLOW_TEMPLATES[tplId];
      setFlow(cloneFlow(tpl));
      setSelectedId(tplId);
      setBuilding(false);
      setRunState({});
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: `Updated. ${tpl.summary}`,
          steps: [`Re-mapped ${tpl.nodes.length} steps`, `Diff applied · 0 breaking changes`],
        },
      ]);
    }, 700);
  }

  return (
    <div className={`app density-${t.density}`} style={{ "--accent": t.accent } as CSSProperties}>
      <Sidebar flows={PREVIOUS_FLOWS} selectedId={selectedId} onSelect={handleSelect} onNew={handleNew} />

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
            node={flow.nodes.find((node) => node.id === focusId)}
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
          onChange={(value) => setTweak("accent", value)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["compact", "regular"]}
          onChange={(value) => setTweak("density", value)}
        />
        <TweakToggle
          label="Show minimap"
          value={t.showMinimap}
          onChange={(value) => setTweak("showMinimap", value)}
        />
        <TweakSection label="Quick actions" />
        <TweakButton label="Trigger build" onClick={() => handleSubmit("Daily digest of GitHub trending repos to my team's email")} />
        <TweakButton label="Run current flow" onClick={handleRun} />
        <TweakButton label="Reset run state" onClick={handleReset} />
      </TweaksPanel>
    </div>
  );
}
