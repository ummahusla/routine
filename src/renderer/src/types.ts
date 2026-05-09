export type NodeType =
  | "trigger"
  | "llm"
  | "transform"
  | "filter"
  | "http"
  | "storage"
  | "output"
  | "branch"
  | "human"
  | "prompt";

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
  prompt?: string;
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
  | "release_announce"
  | "meeting_notes";

export type NodeStatus = "pending" | "running" | "done";

export type RunState = Partial<Record<string, NodeStatus>>;

export type ChatMessage =
  | {
      id?: string;
      role: "user";
      text: string;
    }
  | {
      id?: string;
      role: "ai";
      text: string;
      steps?: string[];
      streaming?: boolean;
    };

export type PreviousFlow = {
  id: FlowTemplateId;
  label: string;
  when: string;
  status: "deployed" | "draft" | "running";
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
  prompt?: string;
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
