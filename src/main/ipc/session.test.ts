import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerSessionIpc } from "./session.js";

type Handler = (event: { sender: unknown }, payload: unknown) => Promise<unknown>;

function makeIpcMain() {
  const handlers = new Map<string, Handler>();
  return {
    handle: vi.fn((channel: string, fn: Handler) => handlers.set(channel, fn)),
    invoke: (channel: string, sender: unknown, payload: unknown) =>
      handlers.get(channel)!({ sender }, payload),
  };
}

const baseDir = "/tmp/test-base";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("registerSessionIpc", () => {
  it("session:create returns sessionId on valid input, calls deps.create", async () => {
    const ipc = makeIpcMain();
    const deps = {
      baseDir,
      registry: { open: vi.fn(), evict: vi.fn(), fanoutDeleted: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
      createSession: vi.fn(async () => ({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", close: vi.fn() })),
      listSessions: vi.fn(async () => []),
      deleteSession: vi.fn(async () => {}),
    };
    registerSessionIpc(ipc as never, deps as never);
    const result = await ipc.invoke("session:create", {}, { title: "demo" });
    expect(result).toEqual({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX" });
    expect(deps.createSession).toHaveBeenCalledWith({ baseDir, title: "demo" });
  });

  it("session:send rejects malformed payload with INVALID", async () => {
    const ipc = makeIpcMain();
    registerSessionIpc(ipc as never, {
      baseDir,
      registry: {} as never,
      createSession: vi.fn() as never,
      listSessions: vi.fn() as never,
      deleteSession: vi.fn() as never,
    });
    const out = await ipc.invoke("session:send", {}, { sessionId: "bad", prompt: "x" });
    expect(out).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("session:unwatch checks WebContents ownership", async () => {
    const ipc = makeIpcMain();
    const unsubscribe = vi.fn();
    registerSessionIpc(ipc as never, {
      baseDir,
      registry: { unsubscribe } as never,
      createSession: vi.fn() as never,
      listSessions: vi.fn() as never,
      deleteSession: vi.fn() as never,
    });
    const sender = { id: "wc-1" };
    await ipc.invoke("session:unwatch", sender, { subscriptionId: "abc" });
    expect(unsubscribe).toHaveBeenCalledWith("abc", sender);
  });
});
