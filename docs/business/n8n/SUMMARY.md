# n8n — Business Summary

A readable digest of the raw research in this folder. Sections mirror the source files (`01–08`); each fact is cross-referenced to the file where the verbatim quotes and source URLs live.

---

## 1. What Is n8n

**Tagline (homepage, May 2026):** *"AI agents and workflows you can see and control"* — *"the world's most popular workflow automation platform for technical teams."*

n8n is a **visual, node-based workflow automation platform** built in TypeScript on Node.js. Users build directed graphs of nodes (triggers + actions) in a drag-and-drop editor; workflows are stored as JSON and executed by a backend engine. It ships with 400+ official integrations (~1,300+ counting community nodes) and 70+ AI nodes built on LangChain (agents, chains, memory, vector stores).

**Name:** "nodemation" → `n8n` (8 letters between the n's, like *i18n* / *k8s*). Always lowercase, pronounced *"n eight n."*

**Origin:** Built by Jan Oberhauser as a side project from 2018 while running link.fish. First GitHub commit **June 23 2019**. Public launch on Product Hunt and Hacker News **October 2019**.

**License — "fair-code":** Source code is open and self-hostable, but commercial resale is restricted. Started as Apache 2.0 + Commons Clause; switched to the custom **Sustainable Use License (SUL)** on **March 17 2022**, which (a) restricts use to "internal business purposes" and (b) explicitly permits paid consulting/support without a separate agreement. n8n was the first project to formally adopt the "fair-code" label (coined with Kenneth Malac in early 2020 at faircode.io).

**Vs. Zapier / Make:**
| | Zapier | Make | n8n |
|---|---|---|---|
| Pricing unit | per task | per operation | per workflow execution |
| Self-hosting | no | no | yes (free tier + Enterprise) |
| Custom JS/Python | limited | Enterprise | built-in everywhere |
| AI nodes | limited | limited | 70+ LangChain nodes |
| Source available | no | no | yes |

n8n's own claim: up to "1000× more cost-efficient" for complex workflows because step count doesn't multiply the bill.

→ See `01-what-is-n8n.md` for verbatim homepage copy, full architecture details, and the fair-code essay.

---

## 2. Business Model & Pricing

n8n monetizes a free, self-hostable core through **cloud subscriptions, enterprise licenses, and OEM/embed deals.** Pricing is **execution-based** — one workflow run = one execution, regardless of how many steps it contains. All paid tiers include unlimited users, unlimited workflows, and every integration.

**Tiers (May 2026, billed annually):**

| Tier | Price | Executions/mo | Deployment | Highlights |
|---|---|---|---|---|
| Community | Free | unlimited | self-host | no SSO, no audit, no support |
| Starter | €20/mo | 2,500 | cloud | 1 project, forum support |
| Pro | €50/mo | 10,000 | cloud | 3 projects, admin roles, history |
| Business | €667/mo | 40,000 | self-host | SSO/SAML/LDAP, Git, environments |
| Enterprise | Contact sales | custom | cloud or self-host | 200+ concurrent, SLA, 365d insights |

**Startup Plan:** 50% off Business (€333/mo) for companies with <20 employees and <€5M raised, valid for one year.

**n8n Embed (OEM):** White-label or backend-only embedding of n8n inside another product. Available on all paid plans, no extra license needed.

**Revenue mix (Sacra, 2025):** ~55% cloud subscriptions · ~30% enterprise licenses · ~15% embedded/OEM. **Gross margins >75%.** **ARPU ≈ $13.3k/year.**

**Stated long-term goal (Jan, Accel podcast):** *"First 1 billion Euro ARR company with less than 500 employees."*

→ See `02-business-model-pricing.md` for full feature lists per tier and overage pricing.

---

## 3. Funding & Revenue

**Total raised: ~$253.5M across four rounds.**

| Round | Date | Amount | Lead | Valuation |
|---|---|---|---|---|
| Seed | Mar 2020 | $1.5M | Sequoia + firstminute | n/d |
| Series A | Apr 2021 | $12M | Felicis Ventures | n/d |
| Series B | Mar 2025 | €55M (~$60M) | Highland Europe | ~$270–350M |
| Series C | Oct 2025 | $180M | Accel (+ NVIDIA NVentures) | **$2.5B** |

Notable: the seed was **Sequoia's first-ever seed in Germany.** Series B was led by Highland Europe (not Sequoia, despite Sequoia following on). Valuation went from ~$350M to $2.5B in roughly seven months.

**ARR trajectory (Sacra, getlatka, n8n disclosures):**
- 2024: ~$7.2M
- July 2025: **$40M** (5.5× YoY)
- "Quadrupled revenue in 8 months after 6 years of steady growth" — Jan, Accel podcast
- Revenue per employee: ~$597k (vs. Zapier's ~$50k headline ratio cited in coverage)

**Other growth metrics (latest available):**
- GitHub: 187,120 stars (top 150 of all time)
- Active users: 230,000+ across free and paid
- Enterprise customers: **3,000+**
- Community forum: 115k members
- Templates: 9,618 published workflows
- 25% Fortune 500 adoption (Taskade)
- 100M+ Docker pulls

**Team size:** 1 (Oct 2019) → 16 (Apr 2021) → 30 (Jul 2023, v1.0) → 71 (end-2024) → **190+ (Dec 2025)**.

→ See `03-funding-revenue.md` for round-by-round investor lists and full quote attributions.

---

## 4. Customers

**Headline named accounts:** Vodafone, Delivery Hero, Microsoft (also a strategic partner), KPMG, United Nations, Huel, Stepstone, Musixmatch, Fullscript, Icatu, Field Aerospace, Unbabel, plus 15+ more with published case studies.

**Strategic partners (logos on partners page):** SAP · AWS · Deutsche Telekom · Microsoft.

**Frequently cited but not verified in n8n's own materials:** Cisco, Uber, Adobe, Accenture, Splunk, PagerDuty. Volkswagen, Decathlon, and Twitch appear in third-party market reports but not on n8n's site.

**Highest-impact case study — Vodafone UK (Cybersecurity SOAR):**
- 33 workflows since Aug 2024
- **£2.2M cost avoided · 5,000+ person-days saved · ~£300k/mo savings**
- Use case: threat intel triage on 3–5B events/month
- *"n8n provides SOAR capability and workflows in a low-code model… It allows us to work smarter rather than harder."* — Claire Van Hinsbergh, Cyber Ops Engineering Manager

**Other standout metrics from case studies:**
- Delivery Hero: 200 hrs/month saved on account-lockout automation
- Field Aerospace: 2-week proposal process → 25 minutes for 80% completion
- Musixmatch: 47 days of engineering saved in 4 months
- BeGlobal: proposals in <1 minute, 10× offer generation
- System: 97% reduction in operation time (4–5 min → 10–20 sec)
- Stepstone: 25× faster API integration; 200+ workflows in production

**Scale claims:** 4.9/5 stars on G2 · 200k+ community members · 15,000–20,000 companies globally use n8n (third-party estimate).

→ See `04-customers.md` for all 27 published case studies with quotes and metrics.

---

## 5. Early History & First Clients

**Jan's pre-n8n path:** Studied Audiovisual Media at Hochschule der Medien (2005–2009), then VFX work at Digital Domain, Pixomondo, and Neon on films including *Maleficent* and *Happy Feet Two*. He moved from artist to "pipeline TD" — automating workflows for VFX artists. The insight that drove n8n: *"Those people — very smart, very well paid, and quite technical — they were always reliant on me… They could have had so much more impact if they would have been empowered."*

Built two prior companies — **showreel.tv** (in college) and **link.fish** — and was actively running link.fish while building n8n on the side for ~1.5 years. He **declined Y Combinator** to stay in Berlin with family.

**Soft launch (June 23 2019):** First GitHub release, shared only on alternativeto.net and Quora. Within 5 months: **10,000 stars**. Issues, PRs and emails started arriving from around the world.

**Public launch (October 2019):** Product Hunt + Hacker News. The HN thread sparked a licensing controversy — a GitHub issue titled *"It's gaslighting to call it open source"* drew 330+ comments. Per the Taskade write-up: *"There's no better marketing for a developer tool than a passionate Hacker News debate about licensing."* HN itself relabeled the post from "Open source Zapier alternative" to "Workflow automation alternative to Zapier."

**First community contributor → first hire — Ricardo Espinoza:** A Venezuelan engineer based in Florida who saw n8n on Product Hunt in October 2019 (*"love at first sight"*). Built a Mandrill node first; eventually contributed **60+ nodes**. **Joined full-time in March 2020** as integration developer. Jan personally answered every contributor question — a habit Sequoia explicitly cited as a reason for the seed investment.

**First commercial milestones:**
- **March 2020:** $1.5M seed, Jan transitions to full-time, hires begin (the **first hire was a developer evangelist** — community-led from day one).
- **December 30 2020:** 100th release.
- **January 2021:** n8n.cloud launches — first SaaS revenue.
- **2021:** n8n.embed launches for OEM customers.
- **April 2021:** Series A; community at 16k, GitHub at 13k+, team at 16.

→ See `05-early-history-first-clients.md` for Ricardo's full story and Jan's VFX origins.

---

## 6. Marketing

n8n's growth engine is **community-led, developer-first, and SEO-rich.** No paid lead-gen as the primary motion; the founder describes the shift as *"from lead generation to community adoption focus."*

**Channel stack and scale (May 2026):**

| Channel | Scale / status |
|---|---|
| GitHub | 187k stars; top 150 all-time |
| Template gallery | 9,618 templates — drove **45% of 2025 sign-ups** |
| Community forum | 115k members (was 6k at v1.0) |
| Reddit r/n8n | 200k+ members (organic, not run by n8n) |
| YouTube | "30 Days of AI", "The Studio", "n8n at Scale" series |
| Blog | AI-heavy editorial since 2024 (RAG, agents, MCP, ReAct) |
| Newsletter | Launched 2024 |
| Ambassador program | 19 ambassadors hosted 14 events in 2024 |
| Affiliate program | 30% rev share on Starter/Pro for 12 months |
| Strategic partners | SAP, AWS, Deutsche Telekom, Microsoft |
| Verified node partners | Featured placement + manual review shield |

**Key positioning moves:**
- **"Fair-code"** — coined with Kenneth Malac in 2020. Became part of every press headline ("fair-code pioneer n8n raises $60M…"). Effectively turned a license restriction into a brand asset.
- **"Migrate from Zapier"** — explicit cost-comparison campaigns; community-driven migration guides claiming "70–90% cost savings."
- **"Excel of AI"** — Jan's framing for the AI pivot: *"If people in a few years think about building AI, the only thing that should come to mind is n8n."*
- **AI Transformation Initiative (late 2024–2025)** — repositioned n8n from connectivity tool to AI orchestration layer; 75% of workflows now contain LLM calls.

**Press regulars:** TechCrunch (3 funding rounds covered), Gründerszene, t3n, Bloomberg, Sifted. Jan has appeared on Sequoia's *Training Data* podcast, Accel's *Spotlight On*, the EU-Startups Podcast (Mar 2026), and Slush 2025.

→ See `06-marketing.md` for the full channel breakdown and template economics.

---

## 7. Founders & Team

**Jan Oberhauser — Founder & CEO.** Solo founder; non-technical degree (audiovisual media, not CS); came up through VFX automation. Lives in Berlin. Founders Pledge member. Says publicly he wants a **European IPO listing.**

Hiring philosophy (Accel podcast):
- *"Humble excellence" — people who are quietly brilliant.*
- *"High-velocity, high-trust, low-ego, and all-in"* (careers page).
- Filters out wealth-motivated candidates: *"He was doing a good job… but he didn't have the same excitement."*
- **Employee NPS: 95–100** depending on the half-year.

**Stated executive team (public sources):**
- David Roberts — VP Product & Design
- Ben Kiziltug — VP Sales
- Elena Ayvazyan — Talent Acquisition Manager
- *No traditional CTO/COO is publicly listed* as of mid-2026 — the company runs lean on top.

**Team makeup:** 30+ nationalities working from 18 countries, remote-first. Two annual offsites (Berlin + Tuscany in 2024). Quarterly hackathons. Each employee gets a **$100/month open-source donation stipend** (introduced at Series A).

**Departments:** Sales, Marketing, Engineering, Operations, Product & Design, People.

**Investor partners on file:**
- Sequoia → Matthew Miller (seed)
- Felicis → Aydin Senkut (Series A)
- Highland Europe → David Blyghton (Series B)
- Accel → Ben Fletcher (Series C)

→ See `07-founders-team.md` for Jan's full bio and quote bank.

---

## 8. Timeline (Quick Reference)

| Date | Event |
|---|---|
| 2005–2009 | Jan studies audiovisual media in Stuttgart |
| Post-2009 | VFX work (Maleficent, Happy Feet Two); becomes pipeline TD |
| 2018 | n8n side-project begins while at link.fish |
| **June 23 2019** | First GitHub commit |
| Oct 2019 | Product Hunt + Hacker News launch; license controversy |
| Nov 2019 | 10,000 GitHub stars |
| Early 2020 | "Fair-code" defined with Kenneth Malac in San Francisco |
| **Mar 2020** | $1.5M seed (Sequoia + firstminute, Sequoia's first DE seed) |
| Mar 2020 | Ricardo Espinoza joins as integration developer |
| Apr 2020 | Jan goes full-time |
| Jan 2021 | n8n Cloud launches |
| 2021 | n8n.embed launches |
| **Apr 2021** | $12M Series A (Felicis) |
| **Mar 17 2022** | Sustainable Use License adopted |
| 2022 | AI pivot begins → 5× revenue |
| Jul 2023 | v1.0 released (production-ready); ~30k stars; ~30 staff |
| 2024 | LangChain integration + 70 AI nodes; team 37→71 |
| Apr 2025 | 75k GitHub stars |
| **Mar 2025** | €55M Series B (Highland Europe), ~$300M valuation |
| May 28 2025 | 100k GitHub stars |
| Jul 2025 | $40M ARR |
| **Oct 9 2025** | $180M Series C (Accel + NVIDIA), **$2.5B valuation** |
| Dec 2025 | n8n 2.0 stable; 190+ staff; 160k+ stars |
| Jan 2026 | "Ni8mare" CVE-2026-21858 disclosed (CVSS 10.0); patched in 1.121.0 |
| May 2026 | 187k stars, 9,618 templates, 3,000+ enterprise customers |

→ See `08-timeline.md` for the full annotated chronology and `sources.md` for the ~140-URL bibliography.
