# Alternatives to n8n and Zapier

Workflow automation / iPaaS / no-code integration platforms — competitive landscape reference.

**Note on self-hosted/open-source flag:** n8n's primary differentiator is its Apache-2.0-licensed self-hosted runtime. Each section below prominently flags whether a competitor offers a comparable option.

---

## Make (formerly Integromat)

Make is a visual, no-code automation platform that lets users connect 3,000+ apps via a drag-and-drop "scenario" builder. It was originally built as Integromat, [acquired by Celonis in 2020](https://www.make.com/en/pricing), and rebranded as Make in 2022. It competes directly with Zapier in the SMB/prosumer segment but with a more flexible, branching workflow model.

**Self-hosted:** No. Cloud-only (AWS, EU and North America regions).

**Pricing ([source](https://www.make.com/en/pricing)):**

| Plan | Price | Credits/month |
|------|-------|---------------|
| Free | $0 | 1,000 |
| Core | $9/mo | 10,000 |
| Pro | $16/mo | 10,000 |
| Teams | $29/mo | 10,000 |
| Enterprise | Custom | Custom |

Credits are consumed per operation (each node execution in a scenario costs one credit). Annual billing saves ~15%. Additional credit bundles can be purchased on all paid plans.

**Target market:** SMB, prosumers, and operations teams. Enterprise tier targets larger organizations needing SSO, custom functions, and 24/7 support.

**Named customers:** Not prominently disclosed; general SMB/mid-market positioning.

---

## Workato

[Workato](https://www.workato.com/) is an enterprise iPaaS and automation platform built around "recipes" (workflows) that span IT, Finance, HR, Sales, and Support. It targets mid-market to large enterprise and positions itself as an alternative to both point-to-point integrations and heavyweight ESBs. As of 2026 it processes billions of transactions monthly for [more than 17,000 customers](https://automationatlas.io/tools/workato/).

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://costbench.com/software/ai-automation/workato/)):** Fully custom; no public list prices. Contracts typically start at ~$10,000/year. Mid-market deals commonly land in the $30,000–$80,000/year range; enterprise deployments reach $150,000–$400,000+/year. Median verified purchase price: ~$65,000/year.

**Target market:** Mid-market and enterprise (typically >$100M revenue). Primary buyers are CIOs, RevOps, and IT ops teams.

**Named customers:** [AT&T, Atlassian, Box, GitLab, Nokia, Toast](https://research.contrary.com/company/workato); roughly 40% of Fortune 500 firms reportedly use Workato for some automation.

---

## Tray.io / Tray.ai

[Tray.ai](https://tray.ai/) is an enterprise automation and integration platform with a visual workflow builder, 400+ connectors, and a native AI/agent orchestration layer. It has rebranded from "Tray.io" to "Tray.ai" to emphasize its AI-first positioning and competes in the mid-market/enterprise iPaaS space.

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://www.integrate.io/blog/trayai-pricing/)):** Task-based (each workflow step = one task). Pro tier starts at approximately $595/month (25,000 tasks included). Team tier starts at ~$1,500/month. Enterprise contracts typically start at $36,000/year. No public free tier; trial available on request.

**Target market:** Mid-market and enterprise operations, RevOps, and IT integration teams.

**Named customers:** [DocuSign](https://www.getapp.com/it-management-software/a/tray-io/) cited publicly; general mid-market/enterprise positioning. Gartner Peer Insights lists reviews primarily from companies with 1,000–10,000 employees.

---

## Pipedream

[Pipedream](https://pipedream.com/) is a developer-first integration and automation platform that lets users build event-driven workflows using Node.js, Python, or Go alongside a visual builder. It offers 3,000+ pre-built app integrations and is optimized for API-to-API automation rather than business-user drag-and-drop.

**Self-hosted:** No. [Not open-source and does not offer self-hosting](https://github.com/PipedreamHQ/pipedream/issues/954); a self-hosting feature request has been open since 2021 with no public timeline. The component library is open-source on GitHub.

**Pricing ([source](https://pipedream.com/docs/pricing)):** Credit-based (1 credit per 30 seconds of compute at 256 MB default memory). Plans:

| Plan | Price | Credits/day |
|------|-------|-------------|
| Free | $0 | Limited daily cap |
| Basic | $29/mo | 2,000 |
| Advanced | $79/mo | 10,000 |
| Business | Custom | Unlimited |

**Target market:** Developers and technical teams at startups and SMBs building API integrations and event-driven automation.

**Named customers:** Not prominently disclosed; developer-community positioning.

---

## Activepieces

[Activepieces](https://www.activepieces.com/) is an MIT-licensed open-source automation platform built as a Zapier alternative with a no-code visual builder, 450+ integrations, and native AI agent/MCP server support. It offers both a managed cloud and a fully self-hosted deployment.

**Self-hosted:** Yes. MIT license. Docker-based self-hosting is free with unlimited task runs. [GitHub repository](https://github.com/activepieces/activepieces) is actively maintained.

**Pricing ([source](https://www.activepieces.com/pricing)):**

| Plan | Price | Notes |
|------|-------|-------|
| Free | $0 | 10 active flows, 1,000 tasks/month |
| Plus | $25/mo | Unlimited tasks, AI agents |
| Business | $150/mo | Team features, RBAC, audit logs |
| Embed | $30,000/year | White-label automation embedded in own SaaS product |
| Self-hosted | Free | Unlimited tasks, unlimited flows |

**Target market:** SMB, startups, developers, and SaaS companies wanting embeddable automation. Self-hosted tier targets cost-sensitive teams and enterprises with data-residency requirements.

**Named customers:** Not prominently disclosed; open-source community and SMB positioning.

---

## Pabbly Connect

[Pabbly Connect](https://www.pabbly.com/connect/) is a workflow automation platform notable for its lifetime deal pricing model and unlimited-task promise on all paid plans. It supports 2,000+ app integrations and targets budget-conscious SMBs and solopreneurs.

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://bloggerspassion.com/pabbly-connect-pricing/)):**

Subscription: from $16/month (annual). Lifetime deals (one-time payment):

| Lifetime Plan | Price | Tasks/month |
|--------------|-------|-------------|
| Standard | $249 | 3,000 |
| Pro | $499 | 6,000 |
| Ultimate | $699 | 10,000 |

Free forever plan: 100 tasks/month. No per-task overage charges on paid plans — differentiating from Zapier/Make. 30-day refund policy.

**Target market:** Solopreneurs, freelancers, SMBs seeking low-cost or one-time-purchase automation. Popular via AppSumo and lifetime deal communities.

**Named customers:** Not disclosed; lifetime deal buyer community.

---

## IFTTT

[IFTTT](https://ifttt.com/) (If This Then That) is a consumer-focused trigger-action automation platform that pioneered the simple applet model for connecting apps and IoT/smart home devices. It is the oldest platform in this list (founded 2011) and focuses on personal productivity and device automation rather than business workflows.

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://ifttt.com/plans)):**

| Plan | Price | Applets |
|------|-------|---------|
| Free | $0/forever | 2 |
| Pro | $2.99/mo | 20 |
| Pro+ | $8.99/mo | Unlimited |
| Business/Connect | Custom | Custom |

The Connect platform allows businesses to embed IFTTT integrations into their own products (custom-priced per deployment).

**Target market:** Consumers, smart home enthusiasts, IoT device makers, and small businesses needing simple trigger-action automations. Not suited to multi-step enterprise workflows.

**Named customers:** Partners include smart home device manufacturers (e.g., brands distributing via the Connect platform). End users are primarily consumers.

---

## Microsoft Power Automate

[Microsoft Power Automate](https://www.microsoft.com/en-us/power-platform/products/power-automate/) is Microsoft's workflow automation product within the Power Platform suite. It covers cloud flows (API-based), desktop RPA (attended and unattended), and process mining. Deep integration with Microsoft 365, Azure, Dynamics 365, and Teams makes it the default choice for Microsoft-ecosystem enterprises.

**Self-hosted:** No cloud self-hosting. Desktop flows (RPA) run on-premises on Windows machines but the control plane is cloud-based.

**Pricing ([source](https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing)):**

| Plan | Price | Use case |
|------|-------|----------|
| Free (trial) | $0 (30 days) | Cloud flows, standard connectors |
| Premium (per user) | $15/user/mo (annual) | Premium connectors, attended RPA |
| Process | $150/bot/mo (annual) | Unattended RPA |
| Hosted Process | $215/bot/mo (annual) | Azure-hosted unattended bots |
| Process Mining Add-on | $5,000/tenant/mo (annual) | Mining + 100 GB storage |
| Per Flow | $500/mo for 5 flows | Flow-level licensing |

Often included in Microsoft 365 E3/E5 enterprise agreements at reduced or no additional cost.

**Target market:** Mid-market to large enterprise, primarily Microsoft-ecosystem organizations. Dominant in public sector, healthcare, and financial services where M365 is already deployed.

**Named customers:** Not prominently named; dominant in Microsoft-account enterprise base.

---

## Boomi

[Boomi](https://boomi.com/) is a veteran iPaaS platform (founded 2000, acquired by Dell in 2010, divested to Francisco Partners and TPG Capital in 2021). It offers integration, API management, master data hub, and EDI capabilities on a single cloud platform. Gartner named it a Leader in its iPaaS Magic Quadrant for 11 consecutive years.

**Self-hosted:** No. SaaS-only (multi-tenant cloud). No on-premises control plane option.

**Pricing ([source](https://boomi.com/pricing/)):** Mostly quote-based. One public entry point:

- Pay-as-you-go: **$99/month** base + usage fees (billed monthly, no contract)
- Named subscription tiers (Professional, Enterprise, etc.) require sales engagement
- Enterprise contracts typically range $50,000–$190,000+/year
- 30-day free trial available

**Target market:** Mid-market and enterprise. [30,000+ customers](https://www.integrate.io/blog/boomi-pricing/) globally, concentrated in healthcare, financial services, manufacturing, and public sector. FedRAMP, HIPAA, and SOC 2 certified.

**Named customers:** Not prominently named on the public site; large installed base across regulated industries.

---

## MuleSoft (Salesforce)

[MuleSoft Anypoint Platform](https://www.mulesoft.com/) is Salesforce's enterprise integration and API management platform, acquired by Salesforce in 2018 for $6.5 billion. It covers API lifecycle management, iPaaS integration, and RPA. The underlying Mule runtime engine is [open-source (Apache 2.0)](https://github.com/mulesoft/mule) but the Anypoint Platform management layer is proprietary.

**Self-hosted:** Partially. The Mule Community Edition runtime is open-source and can be self-hosted. The full Anypoint Platform offers a [Private Cloud Edition](https://docs.mulesoft.com/hosting-home/) (PCE) that hosts the control plane on-premises, and a hybrid option where the runtime runs in-house while the control plane is Salesforce-managed. Enterprise license required for PCE.

**Pricing ([source](https://www.integrate.io/blog/mulesoft-cost/)):** No public pricing. Fully custom/sales-quoted. Measured in vCores (compute capacity) and Mule Flows/Messages. Median contract: ~$69,000/year; large enterprise deployments reach $600,000+/year. Significant negotiation room, especially for existing Salesforce customers.

**Target market:** Large enterprise and global mid-market organizations with complex API/integration needs, often already in the Salesforce ecosystem. Common in financial services, healthcare, manufacturing, and telecom.

**Named customers:** Customers include [Unilever, Coca-Cola, and Siemens](https://www.mulesoft.com/) (cited in marketing). Exact named client list is not publicly maintained.

---

## Celigo

[Celigo](https://www.celigo.com/) is an iPaaS platform specialized in ERP integration, particularly NetSuite. It is the largest NetSuite integration partner, with 200+ pre-built flows and 1,000+ connectors and templates purpose-built for ERP workflows (order-to-cash, procure-to-pay, 3PL). Named a Visionary in the 2026 Gartner Magic Quadrant for iPaaS for the third consecutive year.

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://www.integrate.io/blog/celigo-pricing/)):** Custom/quote-based. No public pricing. Annual contracts typically start at ~$20,000/year. Pricing is based on the number of active integration flows and monthly transaction volume. Negotiated discounts of 15–40% are common.

**Target market:** Mid-market companies running NetSuite, Salesforce, or other ERP/CRM platforms that need pre-built integration templates. [4,000–5,000+ customers](https://automationatlas.io/tools/celigo/) globally, concentrated in retail, wholesale distribution, and professional services.

**Named customers:** Not prominently disclosed; strong community of NetSuite solution providers.

---

## Latenode

[Latenode](https://latenode.com/) is a low-code/no-code automation platform aimed at developers and technical teams, offering 5,500+ integrations, 400+ AI models (OpenAI, Claude, Deepseek, LLaMA), and a per-execution pricing model rather than per-node/operation charging. It positions itself as significantly cheaper than Zapier and Make for the same workloads.

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://latenode.com/pricing-plans)):**

| Plan | Price | Executions/month |
|------|-------|-----------------|
| Free | $0 | 300 |
| Mini | $5/mo | 1,000 |
| Start | $19/mo | 25,000 |
| Team | $59/mo | 250,000 |
| Enterprise | From $299/mo | Custom |

Charges per scenario execution (not per node), which Latenode claims makes it up to 89x cheaper than Zapier for multi-step workflows.

**Target market:** Developers, technical SMB teams, and individuals wanting low-cost automation with code-writing capability and AI model access built in.

**Named customers:** Not disclosed; developer/prosumer positioning.

---

## Zoho Flow

[Zoho Flow](https://www.zoho.com/flow/) is Zoho's native automation and integration product, part of the broader Zoho ecosystem (55+ apps). It connects 900+ applications with a visual flow builder and is priced per organization rather than per user, making it cost-effective for teams already within the Zoho ecosystem. Available as a standalone product or bundled in Zoho One.

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://www.zoho.com/flow/pricing.html)):**

| Plan | Price | Tasks/month |
|------|-------|-------------|
| Free | $0 | 100 (5 flows max) |
| Standard | $10/org/mo (annual) | 5,000 |
| Professional | $24/org/mo (annual) | 10,000 |

Higher task tiers available (up to 5M tasks/month) at proportionally higher prices. 15-day free trial (no credit card). Also included in [Zoho One at $45/employee/month](https://www.zoho.com/flow/pricing.html).

**Target market:** SMB and mid-market organizations already using Zoho CRM, Zoho Books, or other Zoho products. Per-org pricing makes it attractive for teams of any size.

**Named customers:** Not disclosed; Zoho ecosystem customers.

---

## Automate.io (acquired by Notion — sunsetted)

[Automate.io](https://techcrunch.com/2021/09/08/notion-acquires-indias-automate-io-in-push-to-accelerate-product-expansion/) was a Hyderabad-based workflow automation platform with 200+ integrations, competing with Zapier in the SMB space.

**Status:** Acquired by Notion in September 2021. The product was shut down as an independent offering in mid-2022 so the founding team could focus on building Notion's internal automation capabilities. The platform is no longer available to new users. Existing Automate.io workflows ceased to function after the shutdown. No migration path to a comparable Notion product was announced.

**Self-hosted:** N/A (product discontinued).

**Pricing at shutdown:** Had a free tier and subscription plans. All plans were discontinued on acquisition.

**Target market (historical):** SMB teams needing simple app-to-app automation. Primary customer base was small businesses in the 1–50 employee range.

---

## Albato

[Albato](https://albato.com/) is a cloud-based automation and embedded iPaaS platform with two distinct products: a user-facing workflow automation tool (1,000+ app integrations) and "Albato Embedded," a white-label integration layer that SaaS companies can embed directly into their own products. It targets SMBs for direct automation and SaaS companies for embedded integration.

**Self-hosted:** No. SaaS-only.

**Pricing ([source](https://albato.com/pricing)):**

| Plan | Price (monthly) | Price (annual) | Transactions/month |
|------|-----------------|----------------|--------------------|
| Free | $0 | $0 | 100, 5 active automations |
| Pro | $22/mo | $15/mo | Up to 2,000,000 |
| Teams | $93/mo | $65/mo | From 5,000 (5 seats) |
| Custom/Enterprise | Contact sales | Contact sales | Flexible |

Overage: $0.033/transaction (Pro tier). Annual billing saves up to 30%. Albato Embedded pricing is negotiated separately with SaaS partners.

**Target market:** SMBs and freelancers for direct automation; SaaS product teams for embedded/white-label integration. Strong focus on Eastern European and global SMB markets.

**Named customers:** Not prominently disclosed on the public site. AppSumo community has significant presence.

---

## Sources

- [Make Pricing](https://www.make.com/en/pricing)
- [Make Review — Hackceleration](https://hackceleration.com/make-review/)
- [Workato Pricing — CostBench](https://costbench.com/software/ai-automation/workato/)
- [Workato Pricing — Integrate.io](https://www.integrate.io/blog/workato-pricing/)
- [Workato — Contrary Research](https://research.contrary.com/company/workato)
- [Workato Customer List — AppsRunTheWorld](https://www.appsruntheworld.com/customers-database/products/view/workato)
- [Tray.ai Pricing — Integrate.io](https://www.integrate.io/blog/trayai-pricing/)
- [Tray.io Pricing — Automation Atlas](https://automationatlas.io/answers/tray-io-pricing-explained-2026/)
- [Tray.ai — GetApp](https://www.getapp.com/it-management-software/a/tray-io/)
- [Pipedream Pricing Docs](https://pipedream.com/docs/pricing)
- [Pipedream Self-host Feature Request — GitHub](https://github.com/PipedreamHQ/pipedream/issues/954)
- [Activepieces Pricing](https://www.activepieces.com/pricing)
- [Activepieces — GitHub](https://github.com/activepieces/activepieces)
- [Activepieces — Automation Atlas](https://automationatlas.io/tools/activepieces/)
- [Pabbly Connect Pricing — BloggersPassion](https://bloggerspassion.com/pabbly-connect-pricing/)
- [Pabbly Connect Lifetime Deal](https://buy.pabbly.com/connect-onetime/)
- [IFTTT Plans](https://ifttt.com/plans)
- [IFTTT Pricing — Automation Atlas](https://automationatlas.io/answers/ifttt-pricing-explained-2026/)
- [Power Automate Pricing — Microsoft](https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing)
- [Power Automate Pricing — FlowForma](https://www.flowforma.com/blog/power-automate-pricing)
- [Boomi Pricing](https://boomi.com/pricing/)
- [Boomi Pricing — Integrate.io](https://www.integrate.io/blog/boomi-pricing/)
- [MuleSoft Anypoint Pricing](https://www.mulesoft.com/anypoint-pricing)
- [MuleSoft Pricing — Integrate.io](https://www.integrate.io/blog/mulesoft-cost/)
- [MuleSoft Hosting Overview — Docs](https://docs.mulesoft.com/hosting-home/)
- [Mule Community Edition — GitHub](https://github.com/mulesoft/mule)
- [Celigo Pricing — Integrate.io](https://www.integrate.io/blog/celigo-pricing/)
- [Celigo — Automation Atlas](https://automationatlas.io/tools/celigo/)
- [Latenode Pricing Plans](https://latenode.com/pricing-plans)
- [Latenode Price Comparison](https://latenode.com/blog/latenode-platform/latenode-pricing-ltd/price-comparison)
- [Zoho Flow Pricing](https://www.zoho.com/flow/pricing.html)
- [Zoho Flow — Automation Atlas](https://automationatlas.io/answers/zoho-flow-pricing-explained-2026/)
- [Automate.io acquisition — TechCrunch](https://techcrunch.com/2021/09/08/notion-acquires-indias-automate-io-in-push-to-accelerate-product-expansion/)
- [Automate.io — Crunchbase](https://www.crunchbase.com/organization/automate-io)
- [Notion acquires Automate.io — Notion Blog](https://www.notion.com/blog/taking-building-blocks-beyond-the-workspace-welcome-automate-io)
- [Albato Pricing](https://albato.com/pricing)
- [Albato Review — Lindy](https://www.lindy.ai/blog/albato-review)
- [Albato White-label Guide](https://albato.com/blog/publications/embedded-white-label-saas)
