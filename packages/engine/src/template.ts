import type { Envelope } from "./types.js";

const TOKEN = /\{\{\s*(input(?:\.data(?:\.[a-zA-Z_][\w]*)*)?)\s*\}\}/g;

function valueAtPath(env: Envelope, segments: string[]): unknown {
  if (segments.length === 0) return env.text;
  if (segments[0] !== "data") return undefined;
  if (env.data === undefined) return undefined;
  let cur: unknown = env.data;
  for (let i = 1; i < segments.length; i++) {
    if (cur === null || typeof cur !== "object") return undefined;
    const key = segments[i];
    if (key === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[key];
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

// Walks arrays and plain objects, substituting {{input...}} inside any string
// leaf. Anything that isn't a string/array/plain-object is returned unchanged.
// Without this, a param value like ["{{input}}"] would be JSON.stringify'd
// with the {{input}} token still literal.
export function deepSubstitute(value: unknown, env: Envelope): unknown {
  if (typeof value === "string") return substitute(value, env);
  if (Array.isArray(value)) return value.map((v) => deepSubstitute(v, env));
  if (value !== null && typeof value === "object" && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepSubstitute(v, env);
    }
    return out;
  }
  return value;
}
