import type { Flow, FlowTemplateId, PreviousFlow, SuggestedPrompt } from "../types";

export const FLOW_TEMPLATES: Record<FlowTemplateId, Flow> = {
  github_digest: {
    title: "GitHub trending digest → email",
    summary: "Schedule a daily job that pulls trending repos, summarizes them with an LLM, and emails the digest.",
    nodes: [
      { id: "n1", type: "trigger", icon: "schedule", label: "Schedule", sub: "every day · 09:00", col: 0, row: 1 },
      { id: "n2", type: "http", icon: "http", label: "GitHub trending", sub: "GET /trending", col: 1, row: 1 },
      { id: "n3", type: "filter", icon: "filter", label: "Filter language", sub: "lang in [ts, py]", col: 2, row: 1 },
      { id: "n4", type: "transform", icon: "transform", label: "Pick top 5", sub: "sort by stars", col: 3, row: 1 },
      { id: "n5", type: "llm", icon: "llm", label: "Summarize repo", sub: "claude-sonnet", col: 4, row: 0 },
      { id: "n6", type: "llm", icon: "llm", label: "Translate · EN", sub: "claude-haiku", col: 4, row: 2 },
      { id: "n7", type: "transform", icon: "transform", label: "Merge markdown", sub: "join sections", col: 5, row: 1 },
      { id: "n8", type: "storage", icon: "db", label: "Save digest", sub: "supabase: digests", col: 6, row: 2 },
      { id: "n9", type: "output", icon: "mail", label: "Send email", sub: "to subscribers", col: 6, row: 0 },
    ],
    edges: [
      ["n1", "n2"], ["n2", "n3"], ["n3", "n4"],
      ["n4", "n5"], ["n4", "n6"],
      ["n5", "n7"], ["n6", "n7"],
      ["n7", "n9"], ["n7", "n8"],
    ],
  },

  support_triage: {
    title: "Customer support ticket triage",
    summary: "Classify incoming tickets, draft a reply, and route urgent ones to a human reviewer in Slack.",
    nodes: [
      { id: "n1", type: "trigger", icon: "webhook", label: "Inbound ticket", sub: "webhook · zendesk", col: 0, row: 1 },
      { id: "n2", type: "llm", icon: "llm", label: "Classify intent", sub: "5 categories", col: 1, row: 1 },
      { id: "n3", type: "branch", icon: "branch", label: "Severity?", sub: "if urgent → human", col: 2, row: 1 },
      { id: "n4", type: "human", icon: "user", label: "Notify on-call", sub: "slack · #sup-urgent", col: 3, row: 0 },
      { id: "n5", type: "llm", icon: "llm", label: "Draft reply", sub: "tone: warm", col: 3, row: 2 },
      { id: "n6", type: "filter", icon: "check", label: "Quality gate", sub: "tox < 0.1", col: 4, row: 2 },
      { id: "n7", type: "output", icon: "mail", label: "Send response", sub: "zendesk · public", col: 5, row: 2 },
      { id: "n8", type: "storage", icon: "db", label: "Log outcome", sub: "supabase: tickets", col: 5, row: 0 },
    ],
    edges: [
      ["n1", "n2"], ["n2", "n3"],
      ["n3", "n4"], ["n3", "n5"],
      ["n5", "n6"], ["n6", "n7"],
      ["n4", "n8"], ["n7", "n8"],
    ],
  },

  data_etl: {
    title: "Daily analytics ETL",
    summary: "Extract from Postgres + Stripe, transform into a metrics table, and refresh the dashboard.",
    nodes: [
      { id: "n1", type: "trigger", icon: "schedule", label: "Schedule", sub: "every day · 02:00", col: 0, row: 1 },
      { id: "n2", type: "storage", icon: "db", label: "Pull · postgres", sub: "events, users", col: 1, row: 0 },
      { id: "n3", type: "http", icon: "http", label: "Pull · stripe", sub: "GET /charges", col: 1, row: 2 },
      { id: "n4", type: "transform", icon: "transform", label: "Join + clean", sub: "dedupe by id", col: 2, row: 1 },
      { id: "n5", type: "transform", icon: "code", label: "Compute metrics", sub: "MRR · ARR · churn", col: 3, row: 1 },
      { id: "n6", type: "storage", icon: "sheet", label: "Write warehouse", sub: "bigquery: metrics_d", col: 4, row: 1 },
      { id: "n7", type: "http", icon: "http", label: "Refresh dashboard", sub: "POST /refresh", col: 5, row: 0 },
      { id: "n8", type: "output", icon: "slack", label: "Post summary", sub: "slack · #metrics", col: 5, row: 2 },
    ],
    edges: [
      ["n1", "n2"], ["n1", "n3"],
      ["n2", "n4"], ["n3", "n4"],
      ["n4", "n5"], ["n5", "n6"],
      ["n6", "n7"], ["n6", "n8"],
    ],
  },

  ci_pipeline: {
    title: "ci.yml — push to main",
    summary: "Detect changed packages, run typed test matrix, then deploy on green.",
    nodes: [
      { id: "n1", type: "trigger", icon: "bolt", label: "Push · main", sub: "github webhook", col: 0, row: 1 },
      { id: "n2", type: "transform", icon: "filter", label: "Detect changes", sub: "10s", col: 1, row: 1 },
      { id: "n3", type: "transform", icon: "code", label: "Build", sub: "ubuntu-latest · 3m", col: 2, row: 0 },
      { id: "n4", type: "filter", icon: "check", label: "Lint + typos", sub: "17s", col: 2, row: 2 },
      { id: "n5", type: "transform", icon: "code", label: "Test · ubuntu", sub: "8m 40s", col: 3, row: 0 },
      { id: "n6", type: "transform", icon: "code", label: "Test · macos", sub: "6m 42s", col: 3, row: 1 },
      { id: "n7", type: "filter", icon: "check", label: "SDK tests", sub: "16s", col: 3, row: 2 },
      { id: "n8", type: "filter", icon: "check", label: "Integration", sub: "supabase · 7m 35s", col: 4, row: 1 },
      { id: "n9", type: "output", icon: "http", label: "Deploy · staging", sub: "supabase · 38s", col: 5, row: 1 },
    ],
    edges: [
      ["n1", "n2"], ["n2", "n3"], ["n2", "n4"],
      ["n3", "n5"], ["n3", "n6"], ["n3", "n7"],
      ["n5", "n8"], ["n6", "n8"], ["n7", "n8"],
      ["n8", "n9"],
    ],
  },

  lead_enrichment: {
    title: "Lead enrichment + outreach",
    summary: "Take new HubSpot contacts, enrich them with Clearbit, and draft a personal opener.",
    nodes: [
      { id: "n1", type: "trigger", icon: "webhook", label: "New contact", sub: "hubspot webhook", col: 0, row: 1 },
      { id: "n2", type: "http", icon: "http", label: "Enrich · clearbit", sub: "GET /person", col: 1, row: 1 },
      { id: "n3", type: "filter", icon: "filter", label: "ICP match?", sub: "score ≥ 0.7", col: 2, row: 1 },
      { id: "n4", type: "llm", icon: "llm", label: "Draft opener", sub: "claude-sonnet", col: 3, row: 0 },
      { id: "n5", type: "transform", icon: "tag", label: "Tag in CRM", sub: "stage = qualified", col: 3, row: 2 },
      { id: "n6", type: "human", icon: "user", label: "AE review", sub: "slack approval", col: 4, row: 0 },
      { id: "n7", type: "output", icon: "mail", label: "Send sequence", sub: "outreach.io", col: 5, row: 0 },
      { id: "n8", type: "storage", icon: "sheet", label: "Log to sheet", sub: "leads · row", col: 5, row: 2 },
    ],
    edges: [
      ["n1", "n2"], ["n2", "n3"],
      ["n3", "n4"], ["n3", "n5"],
      ["n4", "n6"], ["n6", "n7"],
      ["n5", "n8"], ["n7", "n8"],
    ],
  },

  release_announce: {
    title: "Multi-channel release announcement",
    summary: "Fan out a release note to email, Slack, Twitter, and the blog in parallel — then aggregate engagement metrics.",
    nodes: [
      { id: "n1", type: "trigger", icon: "tag", label: "New release tag", sub: "github · v*", col: 0, row: 2 },
      { id: "n2", type: "http", icon: "http", label: "Fetch changelog", sub: "GET /releases/latest", col: 1, row: 2 },
      { id: "n3", type: "llm", icon: "llm", label: "Draft announcement", sub: "claude-sonnet", col: 2, row: 2 },
      { id: "n4", type: "human", icon: "user", label: "PM approval", sub: "slack · #marketing", col: 3, row: 2 },
      { id: "n15", type: "llm", icon: "llm", label: "Translate · 6 langs", sub: "es · de · ja · fr · pt · ko", col: 3, row: 5 },

      { id: "n5", type: "transform", icon: "transform", label: "Format · email", sub: "mjml template", col: 4, row: 0 },
      { id: "n6", type: "transform", icon: "transform", label: "Format · slack", sub: "block kit", col: 4, row: 1 },
      { id: "n7", type: "transform", icon: "transform", label: "Format · twitter", sub: "thread · 4 posts", col: 4, row: 3 },
      { id: "n8", type: "transform", icon: "doc", label: "Format · blog", sub: "mdx · frontmatter", col: 4, row: 4 },
      { id: "n16", type: "transform", icon: "transform", label: "Format · in-app", sub: "what's-new card", col: 4, row: 5 },

      { id: "n9", type: "output", icon: "mail", label: "Send · resend", sub: "12,847 subscribers", col: 5, row: 0 },
      { id: "n10", type: "output", icon: "slack", label: "Post · slack", sub: "#announcements", col: 5, row: 1 },
      { id: "n11", type: "output", icon: "http", label: "Post · twitter", sub: "POST /tweets", col: 5, row: 3 },
      { id: "n12", type: "output", icon: "doc", label: "Publish · blog", sub: "POST /posts", col: 5, row: 4 },
      { id: "n17", type: "output", icon: "http", label: "Push · in-app", sub: "POST /broadcasts", col: 5, row: 5 },

      { id: "n18", type: "http", icon: "http", label: "Purge CDN cache", sub: "cloudflare · /v1/*", col: 5, row: 6 },
      { id: "n19", type: "output", icon: "doc", label: "Update changelog", sub: "linear · public", col: 5, row: 2 },
      { id: "n20", type: "http", icon: "http", label: "Status page", sub: "statuspage · scheduled", col: 5, row: 7 },

      { id: "n13", type: "transform", icon: "transform", label: "Aggregate metrics", sub: "merge channels", col: 6, row: 2 },
      { id: "n14", type: "storage", icon: "db", label: "Save to warehouse", sub: "bigquery: launches", col: 7, row: 2 },
      { id: "n21", type: "output", icon: "slack", label: "Recap · #team", sub: "engagement digest", col: 8, row: 2 },
    ],
    edges: [
      ["n1", "n2"], ["n2", "n3"], ["n3", "n4"],
      ["n4", "n15"],
      ["n4", "n5"], ["n4", "n6"], ["n4", "n7"], ["n4", "n8"],
      ["n15", "n16"],
      ["n5", "n9"], ["n6", "n10"], ["n7", "n11"], ["n8", "n12"], ["n16", "n17"],
      ["n4", "n19"], ["n12", "n18"], ["n4", "n20"],
      ["n9", "n13"], ["n10", "n13"], ["n11", "n13"], ["n12", "n13"], ["n17", "n13"],
      ["n18", "n13"], ["n19", "n13"], ["n20", "n13"],
      ["n13", "n14"], ["n14", "n21"],
    ],
  },

  meeting_notes: {
    title: "Meeting notes → action items",
    summary: "Transcribe the call, extract decisions and action items, and file them in the right tools.",
    nodes: [
      { id: "n1", type: "trigger", icon: "calendar", label: "Meeting ends", sub: "google calendar", col: 0, row: 1 },
      { id: "n2", type: "http", icon: "http", label: "Fetch recording", sub: "GET /recordings", col: 1, row: 1 },
      { id: "n3", type: "llm", icon: "llm", label: "Transcribe", sub: "whisper-large", col: 2, row: 1 },
      { id: "n4", type: "llm", icon: "llm", label: "Extract actions", sub: "json schema", col: 3, row: 0 },
      { id: "n5", type: "llm", icon: "llm", label: "Summarize", sub: "<= 200 words", col: 3, row: 2 },
      { id: "n6", type: "output", icon: "doc", label: "Create notion doc", sub: "notes/{date}", col: 4, row: 2 },
      { id: "n7", type: "output", icon: "check", label: "Create tickets", sub: "linear · backlog", col: 4, row: 0 },
      { id: "n8", type: "output", icon: "slack", label: "Post recap", sub: "slack · #team", col: 5, row: 1 },
    ],
    edges: [
      ["n1", "n2"], ["n2", "n3"],
      ["n3", "n4"], ["n3", "n5"],
      ["n4", "n7"], ["n5", "n6"],
      ["n6", "n8"], ["n7", "n8"],
    ],
  },
};

export function matchTemplate(prompt: string): FlowTemplateId {
  const p = prompt.toLowerCase();
  const has = (...words: string[]): boolean => words.some((w) => p.includes(w));
  if (has("announce", "launch", "multi-channel", "multichannel", "broadcast", "fan out", "parallel")) return "release_announce";
  if (has("ci", "pipeline", "build", "github action", "test matrix")) return "ci_pipeline";
  if (has("support", "ticket", "zendesk", "customer", "triage", "intercom")) return "support_triage";
  if (has("etl", "warehouse", "metrics", "analytics", "dashboard", "stripe", "mrr")) return "data_etl";
  if (has("lead", "outreach", "crm", "hubspot", "salesforce", "enrich", "clearbit")) return "lead_enrichment";
  if (has("meeting", "transcrib", "recording", "notion", "summary of call", "linear")) return "meeting_notes";
  if (has("github", "trending", "digest", "summarize", "newsletter", "email")) return "github_digest";
  return "github_digest";
}

export const PREVIOUS_FLOWS: PreviousFlow[] = [
  { id: "release_announce", label: "Multi-channel release announcement", when: "1h ago", active: true, status: "deployed" },
  { id: "github_digest", label: "GitHub trending digest", when: "3h ago", status: "deployed" },
  { id: "support_triage", label: "Support ticket triage", when: "Yesterday", status: "draft" },
  { id: "data_etl", label: "Daily analytics ETL", when: "running now", status: "running" },
  { id: "ci_pipeline", label: "ci.yml — push to main", when: "3 days", status: "deployed" },
  { id: "lead_enrichment", label: "Lead enrichment + outreach", when: "Last week", status: "draft" },
  { id: "meeting_notes", label: "Meeting notes → action items", when: "2 weeks", status: "deployed" },
];

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { icon: "tag", label: "Announce a release in parallel to email, Slack, Twitter, and the blog" },
  { icon: "schedule", label: "Daily digest of GitHub trending repos to my team's email" },
  { icon: "webhook", label: "Triage Zendesk tickets and route urgent ones to Slack" },
  { icon: "llm", label: "Turn meeting recordings into Linear tickets and a Notion doc" },
];
