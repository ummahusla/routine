# Zapier — Summary

Quick-read overview of the Zapier research dossier. One section per source file. Plain language, no jargon.

---

## 1. What Is Zapier

**The product.** A no-code tool that connects apps so they can pass data to each other automatically. Built around "Zaps" — a Zap has one **trigger** (something happens in app A) and one or more **actions** (do something in app B, C, D).

**Scale (May 2026):**
- 9,000+ apps connected
- 81 billion tasks run since launch
- 25 million Zaps built by users
- 3.4 million companies use it
- 99.9% uptime

**Name origin.** "ZAP" = connect/zap data between things. "-ier" = makes the word "API" fit inside.

**Started as.** A 2011 side project by three guys in Columbia, Missouri. First built in 54 hours at a hackathon (won it).

**Today's pitch.** "AI automation, governed." Repositioned from workflow tool to AI orchestration platform. Adds Agents, Chatbots, Copilot (AI assistant), MCP support (so Claude/ChatGPT/Cursor can use Zapier's 9,000 apps).

**License.** Closed-source SaaS only. No self-hosting. Runs on AWS. SOC 2 / GDPR / CCPA compliant.

**Main competitors.**
- **n8n** — open source, self-hostable, fewer integrations (~1,500), cheaper for power users
- **Make (Integromat)** — operation-based pricing, ~1,500 integrations
- **IFTTT** — older, consumer-focused
- **Workato** — enterprise-only, $5.7B valuation
- **Microsoft Power Automate** — best inside Microsoft ecosystem

**Market share.** ~7% of the iPaaS (integration platform) space. Market growing from $5B (2021) toward $14–62B (2026).

---

## 2. Business Model and Pricing

**How they charge.** Per "task" — one task = one successful action your Zap completes. Filters, paths, formatters, delays = free, don't count.

**Plans (May 2026):**
| Plan | Price | Who it's for |
|---|---|---|
| Free | $0 | 100 tasks/month, 1 user, 2-step Zaps |
| Professional | $19.99/mo+ | Solo users, multi-step Zaps, webhooks |
| Team | $69/mo+ | Teams up to 25, shared Zaps, SAML SSO |
| Enterprise | Custom | Unlimited users, VPC peering, SCIM, audit logs |

**Standalone products.** Agents (AI assistants) and Chatbots have their own pricing tiers — free up to custom.

**Going over your limit.** Pay-per-task at 1.25x base rate.

**MCP cost.** Each MCP tool call = 2 tasks from your quota. No separate plan.

**Pricing history.**
- 2011 beta: $5 lifetime access
- 2012 launch: started at $15/month
- Old pricing tiers had electrical names: Amps ($11), Volts ($23), Ohms ($58)
- 2024 reform: free plan dropped from 750 to 100 tasks; Tables and Interfaces became free on all plans

**Customer mix.** 40% small business, 35% individuals, 20% mid-size, 5% enterprise.

**Unit economics.** Churn under 5%/month. ARPU ~$42. LTV ~$883 (18 months). Avg contract ~$500.

**Profitable since 2014.** No long-term debt. Revenue per employee ~$229K.

---

## 3. Funding and Revenue

**Total raised: ~$2.68M.** That's it. For a $300M+ ARR business. One of the most capital-efficient SaaS stories ever.

**The rounds:**
| Round | When | Amount | Lead |
|---|---|---|---|
| Seed 1 | Oct 2012 | $1.2M | Bessemer + DFJ |
| Seed 2 | Nov 2014 | $1.36M | Sequoia |
| Secondary | Jan 2021 | — (no new $) | Sequoia + Steadfast |

**The 2021 secondary.** Existing investors sold shares at a **$5 billion valuation**. Founders kept theirs (~80% still owned). ARR was $140M = 30x revenue.

**ARR over time:**
- 2014 → profitable
- 2016 → $25M
- 2019 → $50M
- 2020 → $100M (COVID boost)
- 2021 → $140–165M
- 2023 → $250M
- 2024 → $310M
- 2025 → $400M (projected)

**Users:** 100K (2012) → 1M (2015) → 5M (2019) → 10M+ (2023).

**Employees:** 4 (2012) → 200 (2018) → 400 (2021) → ~800–1,200 (2025). Fully remote across 38 countries.

**Acquisitions:**
- **Makerpad** (Mar 2021) — no-code education
- **Vowel** (Mar 2024) — AI video conferencing
- **NoCodeOps** (Jul 2024) — no-code platform
- **Utopian Labs** (Oct 2025) — AI sales emails

**IPO.** No plans yet.

---

## 4. Customers

**Headline numbers.**
- 2M+ businesses use Zapier
- 3.4M+ companies on the platform
- 69% of Fortune 1000
- 99% of Forbes Cloud 100
- 93% of users say it improved their job

**Named enterprise customers.** Meta, Dropbox, Shopify, Asana, Zendesk, Calendly, Lyft, HelloFresh, Miro.

**Top case studies:**
- **Miro** — peer feedback up from 50% → 93% in 8 weeks
- **Erewhon** — 5,000 hours saved, $40K/year across 10 stores
- **Okta** — 13% of support escalations auto-handled, credential rotations cut from 1 day to 2 hours
- **Vendasta** — $1M revenue recovered, 282 working days/year saved
- **Slate Magazine** — 2,000+ leads/month from one AI agent
- **Smith.ai** — 250+ hours saved weekly
- **Vendavo** — 90% faster lead response
- **Contractor Appointments** — booked $134M in client revenue

**Enterprise AI survey (Oct 2025, 525 C-suite execs):**
- 84% increasing AI agent investment
- 72% already using/testing AI agents
- 49% deployed in customer support
- 47% deployed in operations

---

## 5. Early History and First Clients

**The founders' day jobs.** Wade Foster (email marketing) and Bryan Helmig (developer) both worked at Veterans United Home Loans in Columbia, Missouri. They chatted on IM about side-project ideas.

**Mike Knoop joined** through the local Hacker News scene — there were basically only two HN-active people in Columbia and they connected.

**The hackathon.** Columbia Startup Weekend, October 2011. Pitched as "API Mixer." Built MVP in 54 hours, slept ~6 hours total, won first place. First-ever business to win at that event.

**First paying customer: Andrew Warner (Mixergy), Nov 30, 2011.**
- Wade found him via an 8-month-old Stack Exchange post asking about PayPal → Highrise integration
- Cold-emailed him; Warner asked for a different integration (Wufoo → AWeber)
- Team built it overnight
- Quoted $100, Warner paid via Wade's personal PayPal (no business account yet)
- Warner's tweet: *"I just paid $100 for a product it didn't even launch because @WadeFoster nailed what I was DESPERATE for."*

**How they got the next 100 customers.** Wade went into product forums (Dropbox, Salesforce, Evernote, Stack Exchange) and replied to people asking for integrations. Each link generated 10–15 visits. **50% of those visitors signed up.**

**Paid beta on purpose.** Charged $5–$10 to filter out tire-kickers and get real feedback.

**MVP was manual.** Early "automation" = founders hand-building integrations on the backend, then emailing customers when ready.

**Y Combinator.**
- Winter 2012: rejected
- Summer 2012: accepted (S12 batch). Showed up to interview with 1,000 paying users + 10,000 waitlist + matching orange t-shirts.
- Paul Graham: *"Stop trying to get to the demo and just answer the questions."*
- Worked 16-hour days through the summer.

**Public beta.** May/June 2012, with Asana, Stripe, Salesforce, Basecamp + 116 services.

**Developer Platform.** August 2012. Let any app build its own integration. Game-changer — **by 2023, 99% of integrations were built by partners, not Zapier.**

**Wufoo connection.** Kevin Hale (Wufoo co-founder) was a seed investor. Wufoo was Zapier's first major integration. Hale later became a YC partner (2013–2020).

---

## 6. Marketing

**The whole strategy.** Almost no paid ads. Built an SEO machine that brings in millions of organic visits a month.

**Programmatic SEO — three tiers of pages:**
1. **App pages** — "Gmail integrations" (60K visits/month)
2. **App-to-app pages** — "Slack + Trello" (300 searches/month each, 38,612 such pages)
3. **Workflow pages** — specific use cases

**Traffic numbers.**
- Nov 2020 → 1.19M monthly visitors
- Nov 2023 → 4.8M monthly visitors
- Now → 5.5M+ monthly
- 30,000+ keywords ranking in top 3
- Domain Rating 91

**"Best of" blog posts.** 171 articles bringing in 1.1M visits/month. "Best to-do list apps", "Best URL shorteners", etc.

**Wade's insight:** *"There are all these keyword combinations no one is trying to rank for."*

**Partner program drives 40% of signups.** Tiers: Bronze → Silver → Gold → Platinum. Higher tiers get featured slots, co-marketing, priority support. Grew from 800 → 4,000+ partners in under 5 years.

**Email + community.** Zapier calls it "demand harvesting" — find where demand exists (forums, search, app directories) instead of generating new demand with ads.

**The de-location package (March 2017).** Paid new hires $10,000 to leave the Bay Area. Generated huge press (Inc., FastCompany, ABC7). Job applications jumped 53%. Almost no one actually took the money.

**ZapConnect.** Annual user conference. 2023 launched Tables/Interfaces/Canvas/Chatbot. 2025 launched Copilot, MCP, Enterprise Admin Hub.

**Traffic mix.** 49% organic search, 40% direct, 6% paid.

---

## 7. Founders and Team

**Wade Foster — CEO**
- Industrial Engineering + MBA, Univ. of Missouri
- 24 when he founded Zapier
- Ex-Veterans United email marketer
- Met Bryan in the Mizzou jazz band
- Philosophy: "Don't hire till it hurts." "It's a marathon, not a sprint." "We woke up every day terrified."

**Bryan Helmig — CTO**
- Finance degree, self-taught developer, jazz/blues musician
- Met Knoop through Columbia's Hacker News scene
- Philosophy: "Write code, talk to users, rinse-repeat — that's the magic loop." "Figure out how customers get value and obsess over that."

**Mike Knoop — Co-founder, now Board Member**
- Mechanical Engineering, Univ. of Missouri
- Stepped back from CPO role in 2022 to focus on AI research
- Now runs **Ndea** (AI lab with François Chollet) and the **ARC Prize** ($1M+ AGI competition)
- Still on Zapier's board

**Remote-first since day one.** No offices. ~800–1,200 employees across 38 countries.

**Hiring philosophy.** Slow. Wade: *"We probably had 30 or 40 people before we hired someone who had been a manager before."*

**Senior leadership today.**
- Sheryl Soo — SVP New Products
- Chris Geoghegan — VP Product
- Andrew Berman (ex-Vowel CEO) — Director of AI
- Cody Jones — Head of Partnerships
- New role late 2025: **Chief People & AI Transformation Officer**

**AI inside Zapier.**
- Pre-March 2023: ~10% of staff used AI
- Late 2023: 63%
- End 2024: 77%
- Now: 97%
- Late 2025: more deployed AI agents than human employees

---

## 8. Timeline (Quick Reference)

| Date | Event |
|---|---|
| Sep 2011 | Wade + Bryan start building at Veterans United |
| Oct 2011 | Won Columbia Startup Weekend with "API Mixer" |
| Nov 30, 2011 | First customer (Andrew Warner, $100) |
| Dec 2011 | Wade goes full-time |
| Win 2012 | YC rejection |
| May 2012 | Public beta launches |
| Sum 2012 | YC S12 batch |
| Aug 2012 | Developer Platform launches |
| Oct 2012 | $1.2M seed (Bessemer, DFJ) |
| 2014 | **Profitable**; $1.36M Sequoia seed |
| 2015 | Freemium model |
| Mar 2017 | De-location package |
| 2020 | $100M ARR (COVID boost) |
| Jan 2021 | **$5B valuation** (secondary) |
| Mar 2021 | Makerpad acquired (first M&A) |
| Mar 2023 | **"Code Red"** AI hackathon after GPT-4 |
| Sep 2023 | Tables GA; ZapConnect (Tables, Interfaces, Canvas, Chatbot) |
| Mar 2024 | Vowel acquired; Zapier Central launches |
| Apr 2024 | Pricing reform (free plan: 750 → 100 tasks) |
| Jul 2024 | NoCodeOps acquired |
| 2024 | $310M ARR; 77% AI adoption |
| Oct 2025 | Utopian Labs acquired |
| ZapConnect 2025 | Copilot, MCP, Enterprise Admin Hub |
| Late 2025 | 97% AI adoption; "more agents than employees" |
| May 2026 | $400M ARR projected; 9,000+ apps; 81B+ tasks |

---

## Key Takeaways

1. **Capital efficiency leader** — $2.68M raised → $400M ARR. Profitable since 2014.
2. **SEO won the market** — programmatic integration pages + "best of" blogs = 5M+ organic visitors/month.
3. **Partner-led growth** — 40% of signups come through partners. 99% of integrations built by partners, not Zapier.
4. **Bootstrapped mindset** — founders refused to sell shares even at $5B; treat funding as a tool, not a goal.
5. **Pivoted to AI fast** — From 10% → 97% internal AI adoption in 2 years. Repositioned product as AI orchestration platform.
6. **Remote-first since 2011** — never had offices. De-location package made it a brand story.
