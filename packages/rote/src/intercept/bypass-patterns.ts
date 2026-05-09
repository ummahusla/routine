import type { BypassMatch, BypassPattern, BypassPatternSet } from "../types.js";

const SHELL_TOOLS = new Set(["shell", "bash", "terminal"]);

export function extractCommand(args: unknown): string | null {
  if (typeof args === "string") return args;
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>;
    if (typeof a.command === "string") return a.command;
    if (typeof a.cmd === "string") return a.cmd;
  }
  return null;
}

function ghPattern(): BypassPattern {
  const re = /^\s*gh\s+(issue|pr|repo|workflow|run|gist|api)\b/;
  return {
    match: (_t, c) => re.test(c),
    build: () => ({
      rationale: "GitHub CLI detected — rote has a GitHub adapter",
      suggestions: [
        'rote flow search "<intent>"',
        'rote explore "<intent>"',
        'rote adapter catalog search "github"',
      ],
    }),
  };
}

function curlGitHubPattern(): BypassPattern {
  const re = /^\s*curl\b.*\bgithub\.com\b/;
  return {
    match: (_t, c) => re.test(c),
    build: () => ({
      rationale: "Direct curl against GitHub API — rote has a GitHub adapter",
      suggestions: [
        'rote flow search "<intent>"',
        'rote explore "<intent>"',
      ],
    }),
  };
}

function vendorPattern(name: string, suggestion: string): BypassPattern {
  const re = new RegExp(`^\\s*${name}\\b`);
  return {
    match: (_t, c) => re.test(c),
    build: () => ({
      rationale: `${name} CLI detected — prefer rote adapter`,
      suggestions: [suggestion, `rote adapter catalog search "${name}"`],
    }),
  };
}

export const defaultBypassPatterns: BypassPatternSet = [
  ghPattern(),
  curlGitHubPattern(),
  vendorPattern("stripe", 'rote stripe_probe "<intent>"'),
  vendorPattern("linear", 'rote linear_probe "<intent>"'),
  vendorPattern("supabase", 'rote adapter catalog search "supabase"'),
];

export function classifyBypass(
  toolName: string,
  command: string,
  patterns: BypassPatternSet,
): BypassMatch | null {
  if (!SHELL_TOOLS.has(toolName)) return null;
  for (const p of patterns) {
    if (p.match(toolName, command)) return p.build(command);
  }
  return null;
}
