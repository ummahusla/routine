export type NodeType =
  | "trigger"
  | "llm"
  | "transform"
  | "filter"
  | "http"
  | "storage"
  | "output"
  | "branch"
  | "human";

export type IconName =
  | "schedule"
  | "webhook"
  | "bolt"
  | "llm"
  | "filter"
  | "transform"
  | "code"
  | "http"
  | "db"
  | "mail"
  | "slack"
  | "branch"
  | "check"
  | "user"
  | "doc"
  | "sheet"
  | "calendar"
  | "tag";

export type FlowNode = {
  id: string;
  type: NodeType;
  icon: IconName;
  label: string;
  sub: string;
  col: number;
  row: number;
  x?: number;
  y?: number;
  _userPlaced?: boolean;
};

export type FlowEdge = [string, string];

export type Flow = {
  title: string;
  summary: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type FlowTemplateId =
  | "github_digest"
  | "support_triage"
  | "data_etl"
  | "ci_pipeline"
  | "lead_enrichment"
  | "meeting_notes";

export type NodeStatus = "pending" | "running" | "done";

export type RunState = Partial<Record<string, NodeStatus>>;

export type ChatMessage =
  | {
      role: "user";
      text: string;
    }
  | {
      role: "ai";
      text: string;
      steps?: string[];
    };

export type PreviousFlow = {
  id: FlowTemplateId;
  label: string;
  when: string;
  status: "deployed" | "draft";
  active?: boolean;
};

export type SuggestedPrompt = {
  icon: IconName;
  label: string;
};

export type PaletteItem = {
  type: NodeType;
  icon: IconName;
  label: string;
  sub: string;
};

export type TypeColor = {
  bg: string;
  border: string;
  icon: string;
};

export type Point = {
  x: number;
  y: number;
};

export type NodeBox = Point & {
  w: number;
  h: number;
  cx: number;
  cy: number;
};

export type TweakSettings = {
  accent: string;
  showMinimap: boolean;
  density: "compact" | "regular";
};
