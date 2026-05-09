import type { Envelope } from "./types.js";

const TOKEN = /\{\{\s*(input(?:\.data(?:\.[a-zA-Z_][\w]*)*)?)\s*\}\}/g;

function valueAtPath(env: Envelope, segments: string[]): unknown {
  if (segments.length === 0) return env.text;
  if (segments[0] !== "data") return undefined;
  if (env.data === undefined) return undefined;
  let cur: unknown = env.data;
  for (let i = 1; i < segments.length; i++) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[segments[i]];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function substitute(template: string, env: Envelope): string {
  return template.replace(TOKEN, (_match, expr: string) => {
    const segments = expr.split(".").slice(1); // drop leading "input"
    if (expr === "input") return env.text;
    if (expr === "input.data") {
      return env.data === undefined ? "" : JSON.stringify(env.data);
    }
    return stringify(valueAtPath(env, segments));
  });
}
