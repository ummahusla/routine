import { vi } from "vitest";

export type FakeStreamItem = unknown;

export type FakeAgentSpec = {
  streamItems?: FakeStreamItem[];
  streamThrows?: { afterIndex: number; error: unknown };
  waitResult?: {
    status?: string;
    usage?: { inputTokens: number; outputTokens: number };
  };
};

export type FakeAgent = {
  agent: {
    agentId: string;
    close: ReturnType<typeof vi.fn>;
    [Symbol.asyncDispose]: () => Promise<void>;
  };
  run: {
    cancel: ReturnType<typeof vi.fn>;
    wait: ReturnType<typeof vi.fn>;
    stream: () => AsyncGenerator<FakeStreamItem>;
  };
};

export function makeFakeAgent(spec: FakeAgentSpec = {}): FakeAgent {
  const close = vi.fn(async () => {});
  const cancel = vi.fn(async () => {});
  const wait = vi.fn(async () => ({
    status: spec.waitResult?.status ?? "completed",
    result: "",
    usage: spec.waitResult?.usage,
  }));

  async function* stream(): AsyncGenerator<FakeStreamItem> {
    const items = spec.streamItems ?? [];
    for (let i = 0; i < items.length; i++) {
      if (spec.streamThrows && i === spec.streamThrows.afterIndex) {
        throw spec.streamThrows.error;
      }
      yield items[i];
    }
    if (spec.streamThrows && spec.streamThrows.afterIndex >= items.length) {
      throw spec.streamThrows.error;
    }
  }

  const agent = {
    agentId: "agent-1",
    close,
    [Symbol.asyncDispose]: async () => {
      await close();
    },
  };

  return { agent, run: { cancel, wait, stream } };
}

export type FakeSdkConfig = {
  createBehavior: Array<{ throws?: unknown; agent?: FakeAgent }>;
  sendBehavior?: { throws?: unknown };
};

export function installFakeSdk(cfg: FakeSdkConfig) {
  let createCallIdx = 0;
  const create = vi.fn(async () => {
    const next = cfg.createBehavior[createCallIdx++];
    if (!next) throw new Error("fake SDK ran out of createBehavior entries");
    if (next.throws) throw next.throws;
    if (!next.agent) throw new Error("fake SDK behavior missing agent");
    const fa = next.agent;
    const send = vi.fn(async () => {
      if (cfg.sendBehavior?.throws) throw cfg.sendBehavior.throws;
      return fa.run;
    });
    return { ...fa.agent, send };
  });
  vi.doMock("@cursor/sdk", () => ({
    Agent: { create },
  }));
  return { create };
}
