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
  exec?: ExecFn;
};
