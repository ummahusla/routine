import { randomBytes } from "node:crypto";
import type { WebContents } from "electron";

export interface SessionLike {
  readonly sessionId: string;
  close(): Promise<void>;
}

export type RegistryDeps<S extends SessionLike = SessionLike> = {
  openSession: (sessionId: string) => Promise<S>;
};

type Subscription = { id: string; sessionId: string; webContents: WebContents };

export class SessionRegistry<S extends SessionLike = SessionLike> {
  private readonly deps: RegistryDeps<S>;
  private readonly sessions = new Map<string, S>();
  private readonly opening = new Map<string, Promise<S>>();
  private readonly subs = new Map<string, Subscription>();
  private readonly destroyHandlers = new WeakMap<WebContents, () => void>();

  constructor(deps: RegistryDeps<S>) {
    this.deps = deps;
  }

  async open(sessionId: string): Promise<S> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const inFlight = this.opening.get(sessionId);
    if (inFlight) return inFlight;
    const p = this.deps.openSession(sessionId).then((s) => {
      this.sessions.set(sessionId, s);
      this.opening.delete(sessionId);
      return s;
    });
    this.opening.set(sessionId, p);
    return p;
  }

  subscribe(sessionId: string, webContents: WebContents): string {
    const id = randomBytes(8).toString("hex");
    const sub: Subscription = { id, sessionId, webContents };
    this.subs.set(id, sub);
    if (!this.destroyHandlers.has(webContents)) {
      const handler = () => {
        for (const [k, v] of this.subs) {
          if (v.webContents === webContents) this.subs.delete(k);
        }
      };
      this.destroyHandlers.set(webContents, handler);
      webContents.on("destroyed", handler);
    }
    return id;
  }

  unsubscribe(subscriptionId: string, ownerWebContents: WebContents): void {
    const sub = this.subs.get(subscriptionId);
    if (!sub) return;
    if (sub.webContents !== ownerWebContents) return;
    this.subs.delete(subscriptionId);
  }

  fanout(sessionId: string, event: unknown): void {
    for (const sub of this.subs.values()) {
      if (sub.sessionId !== sessionId) continue;
      if (sub.webContents.isDestroyed?.()) {
        this.subs.delete(sub.id);
        continue;
      }
      sub.webContents.send("session:event", { sessionId, event });
    }
  }

  fanoutDeleted(sessionId: string): void {
    for (const [k, sub] of this.subs) {
      if (sub.sessionId !== sessionId) continue;
      if (!sub.webContents.isDestroyed?.()) {
        sub.webContents.send("session:deleted", { sessionId });
      }
      this.subs.delete(k);
    }
  }

  async evict(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      try {
        await s.close();
      } catch {
        /* ignore */
      }
      this.sessions.delete(sessionId);
    }
    for (const [k, sub] of this.subs) {
      if (sub.sessionId === sessionId) this.subs.delete(k);
    }
  }

  async closeAll(): Promise<void> {
    const closes = Array.from(this.sessions.values()).map((s) =>
      s.close().catch(() => {}),
    );
    this.sessions.clear();
    this.subs.clear();
    await Promise.all(closes);
  }
}
