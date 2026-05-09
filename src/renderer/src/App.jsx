import { useRef, useState } from "react";
import { FLOW_TEMPLATES, PREVIOUS_FLOWS, SUGGESTED_PROMPTS, matchTemplate } from "./data/flowTemplates";
import { NODE_W, NODE_H, GAP_X } from "./data/constants";
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
  const [selectedId, setSelectedId] = useState("release_announce");
  const [flow, setFlow] = useState(() => cloneFlow(FLOW_TEMPLATES.release_announce));
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState({});
  const [refineVal, setRefineVal] = useState("");
  const [messages, setMessages] = useState(() => [
    { role: "user", text: "Announce a release in parallel to email, Slack, Twitter, and the blog" },
    {
      role: "ai",
      text: FLOW_TEMPLATES.release_announce.summary,
      steps: [
        "Identified 14 steps with a 4-way fan-out and fan-in",
        "Mapped to 6 node types in your workspace",
        "Connectors are configured · ready to execute",
      ],
    },
  ]);
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
      requestAnimationFrame(() => scrollToNodes(layer));
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

  // Smoothly scroll the canvas wrapper so the bounding box of the given
  // node ids is centered (best effort — clamps to scrollable extent).
  function scrollToNodes(ids) {
    const wrap = document.querySelector(".cf-canvas-wrap");
    if (!wrap || !flow) return;
    const targets = flow.nodes.filter((n) => ids.includes(n.id));
    if (!targets.length) return;
    const xs = targets.map((n) => nodePos(n).x);
    const ys = targets.map((n) => nodePos(n).y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + NODE_H;
    const padOuter = 16; // .fc-wrap padding
    const cx = padOuter + (minX + maxX) / 2;
    const cy = padOuter + (minY + maxY) / 2;
    wrap.scrollTo({
      left: Math.max(0, cx - wrap.clientWidth / 2),
      top: Math.max(0, cy - wrap.clientHeight / 2),
      behavior: "smooth",
    });
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

  // When a node is removed, bridge each of its predecessors to each of its
  // successors so the chain isn't severed. Existing edges are deduped.
  function handleDeleteNode(id) {
    setFlow((f) => {
      if (!f) return f;
      const preds = f.edges.filter(([, b]) => b === id).map(([a]) => a);
      const succs = f.edges.filter(([a]) => a === id).map(([, b]) => b);
      const remaining = f.edges.filter(([a, b]) => a !== id && b !== id);
      const existing = new Set(remaining.map(([a, b]) => `${a}>${b}`));
      const bridges = [];
      for (const a of preds) {
        for (const b of succs) {
          if (a !== b && !existing.has(`${a}>${b}`)) {
            bridges.push([a, b]);
            existing.add(`${a}>${b}`);
          }
        }
      }
      return {
        ...f,
        nodes: f.nodes.filter((n) => n.id !== id),
        edges: [...remaining, ...bridges],
      };
    });
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

  // Smart chat refine: route execution / structural commands inline,
  // otherwise treat the prompt as a flow re-mapping request.
  function handleRefine() {
    const v = refineVal.trim();
    if (!v) return;
    const lower = v.toLowerCase();
    setMessages((m) => [...m, { role: "user", text: v }]);
    setRefineVal("");

    if (/\b(run|execute|go|start|kick)\b/.test(lower) && !/stop/.test(lower)) {
      setMessages((m) => [...m, { role: "ai", text: "Executing now — watch the canvas." }]);
      setTimeout(() => handleRun(), 250);
      return;
    }
    if (/\b(stop|cancel|halt|abort)\b/.test(lower)) {
      handleStop();
      setMessages((m) => [...m, { role: "ai", text: "Stopped. Nothing was rolled back." }]);
      return;
    }
    if (/\b(reset|clear)\b/.test(lower)) {
      handleReset();
      setMessages((m) => [...m, { role: "ai", text: "Cleared the run state." }]);
      return;
    }
    const addMatch = lower.match(
      /add (?:a |an )?(slack|email|webhook|http|llm|filter|approval|database|spreadsheet|schedule|transform|code)/
    );
    if (addMatch) {
      const kind = addMatch[1];
      const map = {
        slack:       { type: "output",    icon: "slack",    label: "Slack message",  sub: "#channel" },
        email:       { type: "output",    icon: "mail",     label: "Send email",     sub: "smtp" },
        webhook:     { type: "trigger",   icon: "webhook",  label: "Webhook",        sub: "POST /event" },
        http:        { type: "http",      icon: "http",     label: "HTTP request",   sub: "GET /…" },
        llm:         { type: "llm",       icon: "llm",      label: "LLM call",       sub: "claude-sonnet" },
        filter:      { type: "filter",    icon: "filter",   label: "Filter",         sub: "where …" },
        approval:    { type: "human",     icon: "user",     label: "Human approval", sub: "slack approval" },
        database:    { type: "storage",   icon: "db",       label: "Database",       sub: "supabase · query" },
        spreadsheet: { type: "storage",   icon: "sheet",    label: "Spreadsheet",    sub: "google sheets" },
        schedule:    { type: "trigger",   icon: "schedule", label: "Schedule",       sub: "every day · 09:00" },
        transform:   { type: "transform", icon: "transform",label: "Transform",      sub: "map · reduce" },
        code:        { type: "transform", icon: "code",     label: "Code",           sub: "javascript" },
      };
      handleAddNode(map[kind]);
      setMessages((m) => [
        ...m,
        { role: "ai", text: `Added a ${map[kind].label} step at the end. Drag it where you want it.` },
      ]);
      return;
    }

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
          onHome={handleNew}
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
