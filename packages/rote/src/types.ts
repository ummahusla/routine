export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { timeoutMs: number; signal?: AbortSignal },
) => Promise<ExecResult>;

export type RoteFacts = {
  version: string | null;
  adapters: Array<{ id: string; fingerprint: string; toolsetCount: number }> | null;
  pendingStubs: Array<{ workspace: string; name: string; adapter: string }> | null;
  flowCount: number | null;
  activeWorkspace: { name: string; path: string } | null;
};

export type BypassMatch = {
  rationale: string;
  suggestions: string[];
};

export type BypassPattern = {
  match: (toolName: string, command: string) => boolean;
  build: (command: string) => BypassMatch;
};

export type BypassPatternSet = BypassPattern[];

export type RotePluginOptions = {
  bin?: string;
  probeTimeoutMs?: number;
  hintBypassPatterns?: BypassPatternSet;
  rulesFilePath?: string;
  enableHints?: boolean;
  enableProbe?: boolean;
  /**
   * Start an MCP server exposing `rote_exec` so the agent can run rote
   * commands via MCP instead of the SDK's bash tool. Workaround for the
   * SDK bash tool hanging on rote invocations. Defaults to true.
   */
  enableExecMcp?: boolean;
  /** Default per-call timeout (ms) for the rote_exec MCP tool. */
  execTimeoutMs?: number;
  exec?: ExecFn;
};
