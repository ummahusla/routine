import { describe, it, expect, vi } from "vitest";
import { registerRunIpc } from "./run.js";

function makeIpc() {
  const handlers = new Map<string, (e: any, raw: unknown) => unknown>();
  return {
    handle: (channel: string, fn: (e: any, raw: unknown) => unknown) => {
      handlers.set(channel, fn);
    },
    invoke: (channel: string, raw: unknown) => handlers.get(channel)!({ sender: {} }, raw),
  };
}

describe("registerRunIpc", () => {
  it("run:execute returns { ok:true, runId } on success", async () => {
    const ipc = makeIpc();
    registerRunIpc(ipc as any, {
      registry: {
        start: async (sid: string) => `R-${sid}`,
        cancel: async () => {},
        subscribe: () => "SUB",
        unsubscribe: () => {},
      } as any,
      baseDir: "/tmp/x",
    });
    const r = await ipc.invoke("run:execute", { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(r).toEqual({ ok: true, runId: "R-01ARZ3NDEKTSV4RRFFQ69G5FAV" });
  });

  it("run:execute returns invalid on bad input", async () => {
    const ipc = makeIpc();
    registerRunIpc(ipc as any, {
      registry: { start: vi.fn() } as any,
      baseDir: "/tmp/x",
    });
    const r = (await ipc.invoke("run:execute", { sessionId: "bad", junk: 1 })) as any;
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INVALID");
  });

  it("run:watch returns { ok:true, subscriptionId }", async () => {
    const ipc = makeIpc();
    registerRunIpc(ipc as any, {
      registry: {
        start: async () => "x",
        cancel: async () => {},
        subscribe: (_runId: string) => "SUB123",
        unsubscribe: () => {},
      } as any,
      baseDir: "/tmp/x",
    });
    const r = await ipc.invoke("run:watch", {
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      runId: "r1",
    });
    expect(r).toEqual({ ok: true, subscriptionId: "SUB123" });
  });
});
