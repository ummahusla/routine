import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionRegistry } from "./registry.js";

type FakeSession = { sessionId: string; close: ReturnType<typeof vi.fn<[], Promise<void>>> };

function fakeSession(id: string): FakeSession {
  return { sessionId: id, close: vi.fn(async () => {}) };
}

function fakeWebContents() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    send: vi.fn(),
    on: vi.fn((ev: string, cb: () => void) => {
      const arr = listeners.get(ev) ?? [];
      arr.push(cb);
      listeners.set(ev, arr);
    }),
    isDestroyed: vi.fn(() => false),
    _emit(ev: string) {
      for (const cb of listeners.get(ev) ?? []) cb();
    },
  };
}

let registry: SessionRegistry;
let openImpl: (id: string) => Promise<FakeSession>;
beforeEach(() => {
  openImpl = vi.fn(async (id: string) => fakeSession(id));
  registry = new SessionRegistry({ openSession: openImpl as never });
});

describe("SessionRegistry", () => {
  it("memoises openSession per sessionId", async () => {
    await registry.open("S1");
    await registry.open("S1");
    expect(openImpl).toHaveBeenCalledTimes(1);
  });

  it("subscribe + fanout sends session:event to subscribers of that session only", async () => {
    await registry.open("S1");
    await registry.open("S2");
    const wc1 = fakeWebContents();
    const wc2 = fakeWebContents();
    registry.subscribe("S1", wc1 as never);
    registry.subscribe("S2", wc2 as never);
    registry.fanout("S1", { type: "text", delta: "hi" } as never);
    expect(wc1.send).toHaveBeenCalledWith("session:event", expect.objectContaining({ sessionId: "S1" }));
    expect(wc2.send).not.toHaveBeenCalled();
  });

  it("unsubscribe removes the subscription only when caller owns it", async () => {
    const wc1 = fakeWebContents();
    const wc2 = fakeWebContents();
    const subId = registry.subscribe("S1", wc1 as never);
    registry.unsubscribe(subId, wc2 as never); // wrong owner — no-op
    registry.fanout("S1", { type: "text", delta: "hi" } as never);
    expect(wc1.send).toHaveBeenCalled();

    registry.unsubscribe(subId, wc1 as never);
    wc1.send.mockClear();
    registry.fanout("S1", { type: "text", delta: "again" } as never);
    expect(wc1.send).not.toHaveBeenCalled();
  });

  it("removes subscriptions on webContents destroyed", async () => {
    const wc = fakeWebContents();
    registry.subscribe("S1", wc as never);
    wc._emit("destroyed");
    wc.send.mockClear();
    registry.fanout("S1", { type: "text", delta: "x" } as never);
    expect(wc.send).not.toHaveBeenCalled();
  });

  it("evict closes the session and drops subs", async () => {
    const session = await registry.open("S1");
    const wc = fakeWebContents();
    registry.subscribe("S1", wc as never);
    await registry.evict("S1");
    expect(session.close).toHaveBeenCalled();
    registry.fanout("S1", { type: "text", delta: "z" } as never);
    expect(wc.send).not.toHaveBeenCalled();
  });

  it("closeAll closes every session", async () => {
    const a = await registry.open("S1");
    const b = await registry.open("S2");
    await registry.closeAll();
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });
});
