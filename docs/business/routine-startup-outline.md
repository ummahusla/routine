# Routine — Startup Outline

> Working name: **Routine**. A play on "rote" (the underlying execution runtime) and on the everyday meaning — automated routines that just run. Direct, dictionary, brandable, B2B-credible.

## At a glance

- **What:** desktop builder + cloud runner where users create workflows by talking to an agent. Compiled to deterministic flows that execute without further LLM calls.
- **Who:** B2B — marketing agencies, ops/automation consultancies, in-house RevOps at SMBs.
- **Wedge:** build any integration via chat. No catalog limits.
- **Distribution:** open-source desktop app + paid cloud runner (n8n playbook).
- **Built on:** rote — stateless execution runtime that compiles agent traces into parameterized, reusable flows.

---

## 1. Problem

Workflow automation today is split between two broken halves.

### Visual builders (Zapier, Make, n8n) lock you into a catalog

Zapier, Make, and n8n give users a finite set of pre-built integration blocks. If a customer needs to automate against a niche CRM, an internal API, or a brand-new SaaS tool, they wait for the vendor to ship a connector — or wire a brittle "HTTP request" block by hand and maintain it forever.

The result: catalog gates innovation, custom logic still requires engineering time, and every player struggles to maintain 1,000+ integrations. n8n lists ~400 official integrations plus thousands of community nodes; Zapier lists ~7,000+ apps but quality and depth varies widely. Coverage looks broad, but the long tail of "this client's specific tool" is permanently underserved.

### AI agents (Claude, ChatGPT, agent frameworks) re-explore every run

Agents can talk to any API, but each session starts at zero. Tokens burn re-exploring the same endpoints. Output is non-deterministic. Cost is unpredictable. Audit trails are messy. None of this is acceptable for a workflow that must run identically every Tuesday at 9am — which is exactly what production automations require.

### Who feels this most

Digital marketing agencies and ops consultancies. They run 50+ client workflows, each with a different stack quirk. They hit the catalog ceiling weekly ("client uses this obscure tool"). They can't justify per-run AI costs at scale. Their options today:

1. Say no to custom work and lose deals.
2. Hire developers to maintain HTTP-block spaghetti.
3. Eat margins on agent-based automations that should be deterministic.

All three are bad outcomes. The market is wide open for a tool that gives them custom integrations *and* deterministic execution.

---

## 2. Solution

**Routine** is a desktop builder + cloud runner where you build any workflow by talking to an agent, then run the result deterministically forever — at near-zero cost per execution.

### How it works

1. **Chat-first builder.** User opens the desktop app. Sidebar = chat with an agent (Claude-cowork style). User describes a goal in natural language: *"Every Monday, pull last week's Stripe revenue, summarize in plain English, post to Slack #leadership."*

2. **Agent walks the user through it.** The agent asks clarifying questions, requests credentials, probes APIs via rote adapters, and shows each step as a node on the canvas as it gets built. The user sees the workflow take shape live.

3. **Crystallize to a deterministic flow.** Once the agent successfully completes the task end-to-end, rote compiles the trace into a parameterized shell script. No LLM in the execution path. Runs in seconds, costs near-zero.

4. **Mix in LLM blocks where judgment is required.** Summarization, sentiment analysis, classification, copy generation — these become explicit LLM nodes in the flow. The user sees exactly which steps cost tokens and which don't. Best of both worlds: rigid where it should be rigid, flexible where it must be.

5. **Deploy to the cloud runner.** Schedule, webhook triggers, team sharing. The team flow registry becomes a reusable library.

### Why this is structurally different from competitors

| Competitor | What they offer | Where Routine wins |
|---|---|---|
| **Zapier / Make** | Pre-built catalog, visual builder | No catalog. Any API the agent can read = a possible integration. Built in minutes, not when the vendor ships a connector. |
| **n8n** | OSS, low-code, visual builder, growing AI features | Chat-first beats drag-and-drop for non-engineers. Custom integrations on demand. Same OSS distribution model. |
| **Raw agent frameworks (LangChain, etc.)** | Flexible AI, no UI, expensive per run | Deterministic by default. Costs collapse after first build. Auditable. Production-safe. |

### Anchor metaphor

> *"Like Git for workflows — version the intelligence, share it, reuse it, keep it from disappearing."*

Borrowed from rote's positioning. It fits Routine perfectly: every workflow built once becomes a permanent, shareable artifact for the team and the wider community.

---

## 3. Client (Ideal Customer Profile)

### Primary ICP — Digital marketing agencies, 10–100 employees

- Run client retainers covering paid ads, SEO, content, email, reporting.
- Already use 5–15 SaaS tools per client (HubSpot, GA4, Meta Ads, LinkedIn, Stripe, Notion, Slack, Asana, plus niche tools).
- **Pain peaks** on:
  - **Client reporting** (manual weekly pulls across 5+ data sources).
  - **Lead routing** (CRM → Slack → sales handoff with conditional logic).
  - **Client-specific quirks** (every client has one weird tool nobody integrates with).
- **Buyer:** ops manager, agency director, or technical co-founder.
- **User:** account managers, ops staff, junior strategists.
- **Budget:** already paying $20–500/mo per workflow tool per client. Routine displaces or augments multiple line items.

### Secondary ICP — Ops / automation consultancies, 5–50 employees

- Build automations *for* SMB clients as a billable service (Zapier-certified consultants, Make partners, RPA boutiques).
- **Pain:** every client wants something the catalog doesn't cover. Currently quoted as "custom dev" → lost deals or thin margins.
- **Buyer:** consultancy owner / partner.
- **User:** consultants on billable hours.
- **Multiplier value:** each consultant builds a flow once → resells the same flow to multiple clients via the team registry.

### Tertiary (Year 2+) — In-house RevOps / MarketingOps at SMBs (50–500 employees)

- One ops generalist responsible for stitching the company's stack together.
- Land via marketing agency referrals and consultancy delivery.

### Anti-ICP (explicitly not chasing yet)

- **Solo prosumers / Zapier free-tier crowd** — low ACV, support-heavy, weak willingness to pay.
- **Large enterprises (>1000 employees)** — long sales cycles, SOC 2 / SSO / procurement gates that block product velocity. Earn into them in Year 3+ via enterprise tier.

### Why agencies are the right beachhead

| Quality | Why it matters |
|---|---|
| Acute pain | Custom integrations needed weekly. |
| Real budget | Already paying for Zapier, Make, custom dev. |
| Multiplier | One flow built → reused across N clients. |
| Distribution | Agencies love showing off tooling to peers (LinkedIn, Slack groups, conferences). |
| ACV ceiling | $5–25K/year sustainable; not toy SaaS. |

---

## 4. Market

### Category and momentum

Workflow automation / iPaaS / agentic automation. Hot, growing, and being reshaped right now by the AI-native shift.

### Market size signals (from competitor research)

| Player | 2024–25 ARR | Growth | Funding | Valuation |
|---|---|---|---|---|
| Zapier | ~$310M | +24% YoY | $2.7M (bootstrapped) | $5B (2021 secondary) |
| Make (Celonis) | ~$50–100M | 15× over 2 years | bootstrapped, then acquired >$100M | n/a (subsidiary) |
| n8n | ~$40M | 5.5× YoY (post-AI pivot) | $240M total raised | $2.5B (Oct 2025) |

Combined visible ARR across the top three: ~$400M+ and accelerating. Even the #3/#4 player (n8n) crossed $40M ARR with 230K active users and 3,000+ enterprise customers. Average revenue per customer at n8n: ~$13.3K/year (Sacra data). Plenty of room for a fourth specialized player.

### Tailwinds working in Routine's favor

1. **AI repositioning is the breakout move.** n8n grew steadily for 6 years, then 4× in 8 months after its AI pivot. Buyers explicitly want *agentic* automation, not just visual builders. Routine is AI-native from day one.
2. **OSS distribution is proven.** n8n: 187K GitHub stars → $40M ARR → $2.5B valuation on free OSS + paid cloud. Same playbook is repeatable.
3. **Catalog gating is a real, persistent pain.** Every player struggles to maintain 1,000+ integrations. Routine sidesteps it entirely with chat-built integrations.
4. **The agency / consultancy segment is underserved.** Zapier serves SMB end-users; n8n leans developer; Make leans technical ops. Nobody owns "the operating system for an automation-heavy services business."

### Headwinds and risks

1. **n8n is already strong in the OSS-agentic position.** Routine must out-differentiate on chat-native UX *and* custom-integration-on-demand — not just OSS+AI.
2. **Zapier and Make ship AI features fast** (Zapier Central, Make AI Agents). The window narrows; ~12–18 months to land a defensible beachhead.
3. **Enterprise trust of AI-built automation is fragile.** Output must be inspectable and deterministic — Routine's compiled flows answer this directly, but the messaging must lead with it.

### Beachhead sizing

- Start with marketing agencies (10–100 employees) in English-speaking markets: US, UK, Canada, Australia.
- Estimated population: ~50,000 such agencies.
- If 1% adopt at $5K average ACV = **$25M ARR ceiling on the beachhead alone**.
- Expansion into consultancies + RevOps unlocks roughly 10× from there.

### TAM frame

- **TAM:** workflow automation / iPaaS budgets at services-heavy SMBs and mid-market globally — multi-billion dollars per year (visible ARR across Zapier + Make + n8n already ~$400M; full category includes Workato, Tray.io, MuleSoft, and dozens of niche players).
- **5-year SOM target:** 0.5–2% of that pool by emulating n8n's growth curve = $20–100M ARR in years 4–5.

---

## 5. Business Model

**Model:** open-source desktop app + paid cloud runner + team registry + enterprise. Direct lift from n8n's playbook — proven to scale to $40M ARR / $2.5B valuation in roughly 6 years.

### Pricing tiers

| Tier | Who | Price | Includes |
|---|---|---|---|
| **Routine OSS** | Indies, evaluators, devs | Free | Desktop app. Local execution. Local flow library. BYO API keys. Self-hosted runner via Docker. Community support. |
| **Routine Cloud Starter** | Solo consultants, micro-agencies | ~$29 / user / mo | Cloud runner with scheduled + webhook triggers. 1 user. 5K flow runs / mo. Hosted credentials vault. Email support. |
| **Routine Team** | Agencies 5–50 employees | ~$99 / user / mo (5-user min) | Everything in Starter + team flow registry, role-based access, audit logs, 50K runs / user / mo, shared client workspaces. |
| **Routine Business** | Agencies 50–100, consultancies | ~$249 / user / mo | Team + SSO, advanced RBAC, custom retention, priority support, 250K runs / user / mo, white-label client portals. |
| **Routine Enterprise** | 100+ employees, regulated industries | Custom (~$50–200K / yr) | Self-hosted cloud runner, SOC 2 Type II, SLA, dedicated CSM, unlimited runs, custom adapter development, audit / compliance package. |

### Why these tiers fit the ICP

- **Free OSS** is the distribution engine. GitHub-driven discovery (n8n: 187K stars converts well). Low procurement friction — an ops manager installs locally on Tuesday and pitches the team on Thursday.
- **Per-seat billing** (with run quotas inside each seat) suits agencies with predictable team size and unpredictable client run volume. Protects margin against abuse without penalizing growth.
- **White-label / client portals** on the Business tier are a deliberate differentiator vs Zapier (which is consumer-brand-visible). Agencies want to deliver value, not bill clients for "Routine."
- **Enterprise self-hosted** unlocks compliance-bound buyers (healthcare, finance) and agencies with regulated clients.

### Add-on revenue streams (Year 2+)

1. **Routine Marketplace** — paid flow templates from top consultants and agencies. 70/30 revenue split. Network effect: builders sell each other reusable flows; the registry becomes a flywheel.
2. **Custom adapter contracts** — enterprises pay one-time fees for guaranteed-quality adapters against private or internal APIs.
3. **Education / certification** — "Routine Certified Builder" program, modeled on n8n Academy. Creates a talent pool that consultancies hire from, which in turn drives Routine adoption.

### Unit economics target (Year 3)

| Metric | Target |
|---|---|
| Average revenue per agency customer | ~$8K / year (5–10 seats on Team tier) |
| Gross margin | 75 %+ (cloud infra + LLM cost during *build* phase only; near-zero LLM cost at *execution* because flows are deterministic) |
| LTV / CAC | 4× or better |
| Net revenue retention | 120 %+ (seat expansion as agencies grow + tier upgrades) |

### Structural margin advantage

Competitors built on agent-only execution pay LLM tokens forever, on every run. Routine's deterministic flows mean COGS per run drops to near-zero after the workflow is crystallized. Over a customer's lifetime, this gives Routine a structurally higher margin ceiling than any agent-only competitor — and a real story to tell finance buyers at agencies who are already nervous about AI run-cost variance.

### Funding trajectory (analog: n8n)

| Stage | Amount | Trigger |
|---|---|---|
| Pre-seed / Seed | $1.5–2M | Build OSS, ship desktop app, hit early GitHub traction (5–10K stars). |
| Series A | $10–15M | $1M ARR + 50K GitHub stars + first 10 paying agencies. |
| Series B | Defer until $10M+ ARR with AI-pivot-style growth curve (n8n waited 4 years between A and B). |

Capital efficiency is part of the brand: Zapier scaled to $310M ARR on $2.7M raised; Make hit $50M+ entirely bootstrapped. Routine should aim for the same efficient-growth narrative, not the burn-it-all VC-fueled path.

---

## Open questions for next iteration

- **Domain / GTM name confirmation.** "Routine" is the working name; confirm trademark availability and `.com` / `.app` / `.dev` domain status before locking.
- **OSS license choice.** n8n uses Sustainable Use License (fair-code); pure MIT vs SUL has big downstream implications for cloud competition.
- **First 10 design partners.** Need a list of 10 specific agencies / consultancies for design-partner conversations before the MVP scope is finalized.
- **Pricing of LLM build-phase tokens.** Whether to bundle, pass through, or BYO key — affects gross margin in Cloud Starter tier specifically.
- **Self-hosted enterprise deployment story.** Docker / Helm / Kubernetes — choose one to support deeply at launch rather than three poorly.
