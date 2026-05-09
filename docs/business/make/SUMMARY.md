# Make.com — Summary

A short, plain-language overview of the Make research files. Each section matches one file in this folder.

---

## 1. What Is Make

Make is a visual tool that lets people build automations and AI workflows by dragging and connecting blocks — no coding needed. You build "scenarios" (workflows) out of "modules" (steps that do things in apps).

**Key facts:**
- Connects to **3,000+ apps** (560 of them are AI apps)
- Used by **200,000+ businesses**, 3.1 million total users
- Cloud-only (no self-hosted version), runs on AWS in the US or EU
- Owned by **Celonis** (a $13B German process-mining company)
- Was called **Integromat** until February 2022

**Main parts of a scenario:**
- **Triggers** — start the workflow when something happens
- **Modules** — do the work (send email, create record, etc.)
- **Routers** — split the flow into branches
- **Iterators / Aggregators** — break arrays into items, or merge items back together
- **Webhooks** — let outside services start a scenario
- **Data stores** — small built-in databases

**Newer features:**
- **Make Grid** — a live visual map of all your scenarios and how they connect
- **Make AI Agents** — AI that decides what to do based on natural language goals
- **Maia** — an AI helper that builds scenarios for you from a chat prompt
- **Make MCP Server** — lets AI tools (Claude, ChatGPT, Cursor) run your Make scenarios

---

## 2. Business Model and Pricing

Make charges by **credits** (used to be called operations). 1 credit = 1 module run for normal apps. AI modules cost more depending on token use.

**Plans (May 2026):**
| Plan | Price/month (annual) | Credits | Active scenarios |
|------|----|----|----|
| Free | $0 | 1,000 | 2 |
| Core | $9 | 10,000 | Unlimited |
| Pro | $16 | 10,000+ (up to 8M) | Unlimited |
| Teams | $29 | 10,000+ | Unlimited |
| Enterprise | Custom | Custom | Unlimited |

**Free goodies:**
- **NGOs** — free Pro plan for 12 months
- **Schools/students** — free Core plan for 6 months
- **Affiliates** — earn 35% commission for 12 months on referrals

**No self-hosting.** Annual billing saves ~15–20%.

---

## 3. Funding and Revenue

**Integromat (the original company):** Bootstrapped in Prague from 2012. Never raised any outside money. Hit $10M revenue with 250,000 customers by April 2020.

**Acquisition:** Celonis bought Integromat on **October 14, 2020** for **over $100 million** (more than 2.5 billion CZK). The founders had turned down Celonis 3 times before saying yes.

**Make today:**
- ~$52.6M revenue (2025) — CEO says "approaching €100M ARR"
- 100,000+ paying customers
- 3.1 million total users (end of 2024)
- ~478–680 employees
- Grown 15x in revenue, 7x in team since the acquisition

**Celonis (the parent):** Has raised about **$1.77 billion** total. Valued around **$13 billion**. Likely IPO candidate. Make stays a separate business unit inside Celonis.

---

## 4. Customers

**Who uses Make:**
- Solopreneurs running whole businesses on it
- Automation agencies building scenarios for clients
- Mid-market and enterprise teams (HR, sales, ops)

**Famous case studies:**
- **Celonis** (parent company) — built integrations 5x faster; cut expense auditing from $50K/year to $150/year (99.7% saving)
- **SERHANT.** (US real estate) — switched from Zapier, cut automation costs 10x
- **Globant** — uses Make to power AI marketing for McDonald's in Spain, Italy, Germany
- **GoJob** (France) — cut hiring time from 3 days to 15 minutes
- **Greyt** (Germany) — saved €125K, doubled profits
- **Adam** (Czech) — cut dev costs 90%

**Reviews:** 4.7 on G2, 4.8 on Capterra, 4.8 on GetApp.

**Geography:** Strongest in Europe (Germany, Czech, France, UK). The US is the single biggest user country.

**Note:** No proof Spotify, Heineken, Adidas, or Meta are Make customers — those names show up in Zapier marketing, not Make's.

---

## 5. Early History and First Clients

**The story:**
1. In 2012, six Czech founders running an enterprise integration shop (Integrators.cz) built a tool to save themselves time on repeat work for banks and insurance companies.
2. They spent ~4 years polishing it before launching publicly in **2016**.
3. The founders are: **Ondřej Gazda** (CEO), **Patrik Šimek** (CTO), **Michal Toman**, **Pavel Duras** (CFO), **Tomáš Schel**, **Roman Bršlica**.
4. Note: the name "Ondrej Krajicek" sometimes mentioned is **wrong**. The real CEO is Ondřej Gazda.

**How they grew (without spending money):**
- No paid ads ever — pure word of mouth until ~2018
- Then content marketing (tutorials, "Glue of the Internet" Medium blog)
- SEO content like "Zapier vs Integromat"
- Product Hunt launch in January 2017 (43 upvotes)
- Won Get in the Ring Budapest startup competition (2017)
- Joined Google Launchpad Tel Aviv (2018)

**Why people loved it (vs Zapier):**
- Visual canvas instead of a flat list
- Cheaper (paid per "operation" not per "task")
- Built-in error handling, HTTP, JSON, databases
- Even free users got all features

A common user quote: **"Zapier on steroids."**

---

## 6. Marketing

Make's marketing has five main parts:

**1. SEO comparison pages** — they rank for "Make vs Zapier" and "Make vs n8n" with their own dedicated pages.

**2. Free plan as a hook** — anyone can try Make without paying. Pricing is built so heavy users will eventually upgrade.

**3. Make Academy** — free online courses (38 of them). 200,000+ learners, 70,000 badges issued in 2024. Doubles as training and brand-building.

**4. Partners and affiliates:**
   - Solution Partners (agencies)
   - Technology Partners (companies that build app connectors)
   - Affiliate program (35% commission)
   - 1,000+ public app connectors built by partners

**5. Waves conference** — annual user event. Started in Munich (2023), grew to 700+ people in 2025, moves to Prague in 2026.

**Other marketing:**
- 359 blog posts, including yearly "Year in Review" recaps
- Templates gallery with 7,900+ ready-made scenarios
- Make Community forum (45,000+ members)
- Active YouTube creator ecosystem (Nick Saraev is the biggest Make-focused channel)

---

## 7. Founders and Team

**The six co-founders of Integromat (with rough equity stakes at sale):**
| Name | Role | Equity |
|------|------|--------|
| Ondřej Gazda | CEO (now President) | ~10% |
| Patrik Šimek | CTO | ~10% |
| Pavel Duras | CFO | ~20% |
| Michal Toman | Platform Engineer | ~25% |
| Tomáš Schel | Investor | ~25% |
| Roman Bršlica | Investor | ~10% |

**Current CEO of Make: Fabian Q. Veit** — joined April 2022 from Celonis (where he was COO). German, math degree from TU Munich and the Sorbonne. Led the Integromat acquisition deal before becoming Make's CEO.

**Both original tech founders are still there:**
- Gazda is now "Co-Founder and President"
- Šimek is still CTO and helped build the recent products like Make Grid

**Team growth:**
- 2020: 60 employees
- 2023: ~826 (peak)
- 2025–2026: ~478–680 (after some Celonis-wide cuts)

**Offices:** HQ in Prague. Also Munich, US, UK, France, Germany, Canada, India, Chile.

**Glassdoor:** 3.8/5 overall. Good reviews on culture and work-life balance, mixed reviews on management and reorganizations.

---

## 8. Timeline

**Quick history:**

| Year | What happened |
|------|---------------|
| 2012–2013 | Founders start building Integromat as an internal tool in Prague |
| 2015 | Decide to make it a real product |
| May 2016 | Public beta launches; 2,000 users in 3 months |
| Jan 2017 | First Product Hunt launch |
| 2017–2018 | First international recognition (Budapest, Tel Aviv accelerator) |
| Dec 2018 | Error handlers added — a key differentiator vs Zapier |
| 2019 | 277% user growth |
| April 2020 | Hits $10M revenue, 250,000 customers — bootstrapped |
| **Oct 14, 2020** | **Celonis buys Integromat for $100M+** |
| Sep 2021 | First time on Gartner Magic Quadrant |
| **Feb 22, 2022** | **Rebrands to Make** |
| Jun 2022 | AWS Marketplace partnership |
| Sep 30, 2023 | Old Integromat.com permanently shut down |
| Nov 2024 | Waves '24 — Make Grid announced |
| **Apr 2025** | **Make AI Agents launched** |
| May 2025 | Make MCP Server launched (works with Claude, ChatGPT) |
| Jun 2025 | Make Grid generally available |
| Aug 2025 | Billing changes from "operations" to "credits" |
| Oct 2025 | Waves '25 — Maia AI builder, next-gen AI Agents |
| Oct 2026 | Waves '26 will be in Prague |

---

## 9. Sources

The `sources.md` file is a complete bibliography — every URL used across the other files, sorted by topic:
- Make.com official pages, blog, help center, community
- Customer case studies
- Press releases (acquisition, rebrand, AI Agents, Make Grid)
- TechCrunch and other tech press
- Czech press (Czech Startups, CzechTheValley, CzechCrunch)
- Founder interviews and podcasts
- Hacker News, Product Hunt
- Review sites (G2, Capterra, Gartner, Trustpilot)
- LinkedIn profiles
- Influencer / YouTuber profiles
- Pricing analyses

Use it as a lookup index when you need to find the original source for a specific fact.
