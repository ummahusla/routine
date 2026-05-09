# Zapier Business Model and Pricing

> Raw research dossier. All quotes are verbatim from primary sources. Every fact includes a source URL.

---

## Pricing Tiers — Current (as of May 2026)

Source: https://zapier.com/pricing (fetched May 2026)

### Free Plan

> Price: "$0/month (free forever)"
> Task Limit: 100 tasks/month
> Features:
> - "Two-step Zaps" with one trigger and one action
> - Unlimited Zaps, Tables, and Forms
> - "Zapier Copilot" with daily message limits
> - 2,500 Table records
> - 10 form project pages
> - 1 user
> - 15-minute polling interval

**Notable change:** Free plan was reduced from 750 tasks/month to 100 tasks/month in 2024.
Source: https://www.eesel.ai/blog/zapier-subscription

### Professional Plan

> Price: "Starting at $19.99/month (billed annually)"
> Task Limits: Multiple tiers available — 750, 1.5K, 2K, 5K, 10K, 20K, 50K, 100K, 200K+ tasks/month
> Key Features:
> - "Multi-step Zaps" with multiple actions from single trigger
> - "Unlimited Premium apps"
> - Webhooks support
> - Email and live chat support (live chat at 2,000+ tier)
> - AI fields for data enrichment
> - Conditional form logic
> - 14-day free trial (no credit card required)

### Team Plan

> Price: "Starting at $69/month (billed annually)"
> Task Limits: Same task tier options as Professional
> Key Features:
> - "25 users" who can create and manage automations
> - "Shared Zaps and folders" with customizable permissions
> - Shared app connections
> - "SAML SSO" for secure access
> - "Premier Support" — faster, prioritized responses from dedicated Premier Support team
> - Collaboration features

### Enterprise Plan

> Price: Custom pricing (contact sales)
> Task Limits: Annual limits instead of monthly
> Key Features:
> - "Unlimited users"
> - Advanced admin permissions and app controls
> - "Advanced deployment options" including VPC Peering
> - Observability and monitoring tools
> - Technical Account Manager (at threshold or add-on)
> - Enterprise audit logs
> - SCIM provisioning
> - Custom data retention policies

**Annual savings discount:** "Pay yearly (Save 33%)" available across all paid plans.

---

## Agents Pricing (Standalone Product)

Source: https://zapier.com/pricing (fetched May 2026)

### Agents Free
> Price: $0/month
> Activities: 400/month
> Features: Live data sources, web browsing, Chrome Extension

### Agents Pro
> Price: $33.33/month (billed annually)
> Activities: 1,500/month

### Agents Enterprise (Coming Soon)
> Price: Custom pricing
> Features: Agent sharing, enterprise audit logs, restricted apps support

---

## Chatbots Pricing (Standalone Product)

Source: https://zapier.com/pricing (fetched May 2026)

### Chatbots Free
> Price: $0/month
> Chatbots: 2 total
> Features: GPT-4o mini access, conversation history, suggestions

### Chatbots Pro
> Price: $13.33/month (billed annually)
> Chatbots: 5 total
> Features: Embed capability, 10 knowledge sources, 100K Table records, lead collection

### Chatbots Advanced
> Price: $66.67/month (billed annually)
> Chatbots: 20 total
> Features: Remove Zapier logo, 20 knowledge sources per chatbot

### Chatbots Custom
> Price: Contact sales
> Chatbots: 20+ total
> Features: Fully customizable

---

## Key Pricing Model Facts

### Task-Based Billing

From the Zapier pricing blog post (https://zapier.com/blog/zapier-pricing/, fetched May 2026):

> "Zapier only counts tasks when an action you've specified actually happens"

> A task is defined as "an action your Zap (automation) successfully completes. For example, if your Zap has an action to create new contacts in your CRM, each contact that's created will count as one task."

> "advanced logic steps like Filters and Paths don't count toward your task usage at all—which means you can build smarter, more efficient workflows without constantly watching the meter."

**Built-in Tools that do NOT count as tasks:**
- Filter by Zapier
- Formatter by Zapier
- Path by Zapier
- Delay
- Looping
- Sub-Zap
- Digest
- Zapier Manager

From https://help.zapier.com/hc/en-us/articles/15279018245901-How-pay-per-task-billing-works-in-Zapier:

> "Once you've reached your limit, we'll switch you to pay-per-task billing at a rate of 1.25x the cost of a base task"

> "Each MCP tool call uses two tasks from your plan's quota"

---

## Historical Pricing

### Original "Fibonacci" Pricing (circa 2012)

From the Taskade history article (https://www.taskade.com/blog/zapier-history):

> Original pricing used a Fibonacci sequence naming scheme:
> - "Amps" — $11/month
> - "Volts" — $23/month
> - "Ohms" — $58/month

### 2012 at Launch

From TechCrunch seed round article (https://techcrunch.com/2012/10/31/zapier-raises-1-2m-seed-round/):

> "Free limited version available; premium accounts started at $15/month"

### Beta Pricing (Pre-Launch, 2011)

From the Taskade history article:
> Beta price: "$5 for lifetime beta access"

From the First 1000 newsletter (https://read.first1000.co/p/zapier):
> The team "charged users $5–$10 during beta (after testing $100 to $1 pricing iterations)"

### 2017 Plan Structure

From the Contrary Research report and historical sources:
- Team plan: $250/month
- Enterprise plan: $600/month

### 2024 Major Pricing Reform

From multiple sources (fetched May 2026):

> "Zapier introduced a new Enterprise plan on April 2, 2024, replacing their previous 'Company' plan."

Key changes in 2024 reform:
- Unlimited Zaps added to all plans (previously had Zap limits)
- Tables and Interfaces made free on all plans (previously $20+/month add-ons per https://zapier.com/blog/zapconnect-product-updates-2023/, ZapConnect 2025 press release)
- Free plan reduced from 750 to 100 tasks/month
- Pay-per-task billing enabled by default for accounts created after January 2024

---

## The Task Pricing Model Philosophy

From Zapier's pricing blog post (https://zapier.com/blog/zapier-pricing/):

> "Zapier delivers better long-term value—especially when you factor in predictability, ease of use, and the cost of your time."

**Value proposition highlights:**
- Over 8,000 app integrations
- No-code builder with advanced capabilities
- Built-in AI tools without separate subscriptions
- SOC 2 Type II and SOC 3 compliance

**ROI examples cited in the blog post:**
- $115K annual savings
- $500K hiring costs avoided
- $1M revenue recovery through automation efficiency

This contrasts with n8n's model. From n8n's comparison blog (https://blog.n8n.io/make-vs-zapier/):
- Make: "Charge for each individual operation"
- Zapier: "Charge for each individual task"
- n8n: "Charge per workflow, no limit on tasks / steps"

n8n claims to be "1000 times more cost-efficient compared to Zapier or Make" for some complex automations. The key difference: n8n counts a workflow run as one unit regardless of step count; Zapier counts each successful action as one task.

---

## Premium Apps

Zapier maintains a concept of "Premium apps" — integrations that require a paid plan. From the Professional plan description (https://zapier.com/pricing):

> "Unlimited Premium apps" included on Professional and above.

Free plan users: access to standard integrations only, with some apps requiring paid plans.

---

## Business Model Philosophy — Founder Quotes

From Wade Foster in the Forbes interview (reported via https://www.startupbooted.com/zapier-valuation-secrets-the-hidden-growth-story-that-shocked-silicon-valley):

> "For us, we've always looked at financing events, whether they're primary, secondary or public markets, as a tool in the tool belt. It's something that you can reach for as a person who runs a business that can help you when you need it... I think that's a much healthier approach to things than sort of getting on a hamster wheel that is difficult to get off."

From the 20VC podcast (https://www.deciphr.ai/podcast/20vc-scaling-zapier-to-140m-arr-and-a-5bn-valuation-on-14m-of-funding-what-founders-misunderstand-about-fundraising--how-founders-should-think-about-secondaries-today-with-wade-foster-founder--ceo--zapier):

> "You are not raising money. You are selling a part of your company."

> "We treat it like the last money we were ever going to get."

From the Taskade history article on bootstrapping philosophy:

> Foster: "We've always felt like the success of our business was about making our customers successful — it wasn't about dollars raised."

> Foster: "If your business is growing at a healthy clip and you're meeting your goals, why take on the dilution?"

---

## Monetization Strategy

Zapier's business model centers on **subscription SaaS with usage-based escalation**:

1. **Freemium acquisition**: Free plan with 100 tasks/month converts users who discover value
2. **Subscription upgrade path**: Professional ($19.99/mo) → Team ($69/mo) → Enterprise (custom)
3. **Task-based escalation**: Users who exceed task limits within a tier pay 1.25x per additional task
4. **Enterprise expansion**: Large organizations with governance needs → Enterprise plan (custom pricing, annual contract)
5. **Standalone AI products**: Agents and Chatbots as separate subscription products
6. **Integration partnerships**: Partners drive 40% of signups (see 06-marketing-zapier.md)

---

## Revenue Breakdown and Financial Context

From the Contrary Research report (https://research.contrary.com/company/zapier):

- Monthly churn rate: "below 5%"
- Customer lifetime value (18-month increase): US$400 to US$883
- Average revenue per user (doubled): US$20 to US$41.70
- Average contract value: approximately US$500
- Revenue per employee: approximately $228,800 (with ~1,221 employees and $310M revenue in 2024)

---

## Customer Segmentation by Plan Size

From SQ Magazine (https://sqmagazine.co.uk/zapier-statistics/):

- Small businesses: 40%
- Individual users: 35%
- Mid-sized teams: 20%
- Enterprise: 5%

---

## Profitability Timeline

- **2014**: Became profitable (from Wikipedia, https://en.wikipedia.org/wiki/Zapier)
- Approximately 2 years post-founding to reach profitability
- Zero long-term debt as of June 2022 (Contrary Research)
- Total venture capital raised: $1.4M–$2.68M

---

## ZapConnect 2025 Pricing Changes

From the ZapConnect 2025 press release (https://finance.yahoo.com/news/zapier-adds-copilot-assistant-enterprise-130000698.html):

> "Tables and Interfaces now included in all subscription tiers (previously $20+ monthly add-ons)"

This means all Zapier users — including Free plan users — now receive Tables and Interfaces at no additional cost. Previously these were paid add-ons at approximately $20+/month each. This was positioned as a significant competitive move at ZapConnect 2025.

---

## Zapier vs. Competitors on Pricing

From Zapier's own blog comparing with n8n (https://zapier.com/blog/n8n-vs-zapier/):

> Zapier: "Predictable operating expenses" vs. n8n: "Hidden infrastructure costs"
> The post estimates n8n enterprise self-hosted deployment could reach "$300K" when accounting for personnel and infrastructure.

From pxlpeak.com (https://pxlpeak.com/blog/ai-tools/zapier-pricing-2026):

Comparison headline pricing as of 2026:
- **Zapier Professional**: $19.99/month (750 tasks)
- **Make**: Comparable plan roughly 30% cheaper
- **n8n Starter**: €20/month (2,500 executions, cloud)
- **n8n Cloud Pro**: €50/month (10,000 executions)
