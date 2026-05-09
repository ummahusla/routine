# Make.com Business Model and Pricing

> Raw research dossier. All quotes are verbatim from primary sources. Every fact includes a source URL.
> Fetched May 2026.

---

## Company Background

Make (formerly Integromat) was founded in 2013 in Prague, Czech Republic as a bootstrapped automation platform. In 2020, Integromat was acquired by Celonis SE, the German process mining company. In February 2022, the platform was rebranded as "Make" after acquiring the Make.com domain from former owner Digimedia, Inc. for an undisclosed fee.

Source: https://www.businesswire.com/news/home/20220222005231/en/Integromat-Evolves-to-Make-Expanding-Its-Vision-to-Empower-Creators-to-Innovate-Without-Limits

---

## Billing Model: Credits (formerly Operations)

### Transition: August 27, 2025

On **August 27, 2025**, Make.com replaced operations with credits as the core billing unit. Existing operations balances converted automatically at a **1:1 rate** (1 Operation = 1 Credit). Operations still appear in scenario execution logs — but billing is entirely credit-based.

Sources: https://help.make.com/introducing-credits-new-billing-unit-live-in-make, https://community.make.com/t/introducing-credits-a-new-system-of-billing/89480

### What Was an Operation (Legacy Definition)

Source: https://help.make.com/operations

> "An operation is a single module run to process data or check for new data."
> "Every time your scenario is triggered it consumes one operation no matter how many data bundles are processed/output by the trigger module."
> "A module's number of operations depends on the number of bundles it processes. For example, the Gmail > send an email module sending 5 emails equals 5 operations (one per email)."

### How Credits Work (Current System)

Source: https://help.make.com/credits, https://help.make.com/how-features-use-credits

- **Standard (non-AI) workflows:** 1 operation = 1 credit
- **AI workflows using Make's built-in AI provider:** dynamic pricing — credits based on operations + token usage combined
- **AI workflows using custom AI provider (own API key):** 1 credit per operation (fixed; token costs paid directly to AI provider)

Real-world test: A workflow using AI Agents with "Small" model through Make's built-in AI provider cost **43–50 credits per run**.
Source: https://medium.com/@susanatoth-workflows/i-tested-make-coms-new-ai-agents-on-a-live-workflow-here-s-what-it-actually-costs-6fbf03d02e8e

---

## Pricing Tiers — Current (as of May 2026)

Source: https://www.make.com/en/pricing

| Plan | Annual (per month) | Monthly (per month) | Credits/Month | Active Scenarios | Min. Interval |
|------|-------------------|---------------------|---------------|-----------------|---------------|
| Free | $0 | $0 | 1,000 | 2 | 15 minutes |
| Core | $9 | $10.59 | 10,000 | Unlimited | 1 minute |
| Pro | $16 | $18.82 | 10,000+ | Unlimited | 1 minute |
| Teams | $29 | $34.12 | 10,000+ | Unlimited | 1 minute |
| Enterprise | Custom | Custom | Custom | Unlimited | 1 minute |

Sources: https://www.make.com/en/pricing, https://www.eesel.ai/blog/make-pricing, https://pxlpeak.com/blog/ai-tools/make-pricing-guide, https://www.lindy.ai/blog/make-com-pricing

### Free Plan — $0/month
- 1,000 credits/month
- 2 active scenarios max
- 15-minute minimum scheduled polling interval
- Webhooks (instant), visual workflow builder, 3,000+ app integrations, routers and filters, Make AI Agents

### Core Plan — $9/month (annual) / $10.59/month (monthly)
- 10,000 credits/month base
- Unlimited active scenarios
- 1-minute minimum interval
- Make API access, higher data transfer limits, webhooks and HTTP modules, custom AI provider connections (added Nov 6, 2025)

### Pro Plan — $16/month (annual) / $18.82/month (monthly)
- 10,000 credits/month base (up to 8M credits/month)
- Unlimited active scenarios
- Everything in Core PLUS: full-text execution log search, custom variables, scenario inputs, priority scenario execution

### Teams Plan — $29/month (annual) / $34.12/month (monthly)
- 10,000 credits/month base (scalable)
- Unlimited active scenarios
- Everything in Pro PLUS: team roles and permissions, shared scenario templates, team collaboration features

### Enterprise Plan — Custom pricing (contact sales)
- Custom credit allocation
- Everything in Teams PLUS:
  - SSO (OIDC and SAML 2.0; Okta, Microsoft AD, Google)
  - SCIM provisioning
  - Audit logs (12-month retention)
  - 24/7 Enterprise Support with defined SLA
  - 99.5% Cloud Service Uptime SLA
  - Value Engineering team access
  - Enterprise app integrations, custom functions, dynamic connections
  - Domain Claim, overage protection, extended execution log storage
  - Private AWS environment (for largest customers)
  - On-premises Agent for local data access
  - AWS Marketplace purchasing

Sources: https://www.make.com/en/enterprise, https://help.make.com/audit-logs, https://help.make.com/single-sign-on

---

## Data Transfer and Storage Limits

Per 10,000 licensed credits/month:
- **Data transfer:** 5 GB/month
- **Data store storage:** 10 MB (minimum 1 MB per data store)
- **Incomplete executions storage:** up to 2 GB total

Sources: https://www.make.com/en/product-description.pdf (August 2025), https://community.make.com/t/data-transfer-limit/33041

---

## Extra Credits and Overage

Source: https://help.make.com/extra-credits, https://help.make.com/adjustments-to-plans-and-pricing

As of **November 6, 2025**, extra credits carry a **25% premium** over base plan credit rate, whether purchased manually or via auto-purchasing (previously: auto was 30% premium, manual was 0%).

- Available tiers: 20K, 40K, 80K credits, and higher
- Monthly plan: extra credits expire end of billing cycle
- Annual plan: extra credits valid until end of billing year
- No automatic surprise overage charges — scenarios pause or you act explicitly

---

## November 6, 2025 Pricing Adjustments

Source: https://help.make.com/adjustments-to-plans-and-pricing, https://community.make.com/t/important-update-adjustment-to-plans-and-pricing/94578

1. Extra credit premium standardized to 25% (both manual and auto-purchase)
2. Core plan max credit limit: up to 300,000 credits/month
3. Pro plan max credit limit: up to 8,000,000 credits/month
4. Custom AI provider connections available on all paid plans

---

## Make AI Agents — Pricing

Source: https://help.make.com/make-ai-agents-the-next-step-in-automation

- **Not a separate product** — bundled within standard Make credit system
- Available on **all plans including Free**
- Became production feature: **February 2026**
- Uses Make's built-in AI provider: dynamic credit cost (operation + token credits)
- Uses custom API key: 1 credit per operation (flat)

---

## Deployment: Cloud-Only (SaaS)

Source: https://www.make.com/en/blog/cloud-vs-self-hosted-automation

> "Make is a fully managed, cloud-only platform, and all of your workflows, credentials, and the data you process will live exclusively on Make's infrastructure, which is hosted on AWS either in the United States (Virginia) or in the European Union."

No self-hosted or on-premises version. Enterprise exception: private AWS environment available for largest enterprise customers; on-premises Agent for local data access (scenarios still cloud-executed).

---

## Free Trial

No traditional time-limited free trial. Free plan serves as indefinite trial. Some sources note a 30-day money-back guarantee on Core plan upgrades.

---

## Discounts

### Annual Billing: ~15–20% savings across all paid plans
Source: https://help.make.com/monthly-and-annual-subscriptions

### NGO Program — Free Pro Plan (12 months)
Source: https://www.make.com/en/ngo-program

Free Make Pro plan (40,000 credits/month) for 12 months. Requirements: certified nonprofit, year-round operation, measurable impact, neutral/inclusive (no political/religious affiliation).

### Academic Alliance — Free Core Plan (6 months)
Source: https://www.make.com/en/academic-alliance

Free Core plan access for teachers and students for 6 months per institution.

---

## Partner / Affiliate Program

Source: https://www.make.com/en/affiliate, https://help.make.com/affiliate-program

- **Commission:** 35% on all referrals for 12 months (from registration date, not first payment)
- **Minimum payout:** $100 earned with 3 unique paying users
- **Managed via:** PartnerStack
- **Application:** Open to anyone with a Make account; reviewed by Make team

No white-label program found in public documentation.

Technology Partner Program (for ISVs building public app connectors) also available via https://www.make.com/en/partners

---

## Billing Model Comparison

| Platform | Unit | Counting Method |
|----------|------|----------------|
| Make | Credits | Each module execution = 1 credit; AI = operation + token credits |
| Zapier | Tasks | Each successful action = 1 task; filters/formatters exempt |
| n8n | Workflow executions | Entire workflow = 1 execution regardless of step count |

Source: https://blog.n8n.io/make-vs-zapier/

> "Make: Charge for each individual operation. Zapier: Charge for each individual task. n8n: Charge per workflow, no limit on tasks / steps."

---

## Sources

- https://www.make.com/en/pricing
- https://help.make.com/credits
- https://help.make.com/introducing-credits-new-billing-unit-live-in-make
- https://help.make.com/how-features-use-credits
- https://help.make.com/operations
- https://help.make.com/extra-credits
- https://help.make.com/adjustments-to-plans-and-pricing
- https://help.make.com/monthly-and-annual-subscriptions
- https://help.make.com/single-sign-on
- https://help.make.com/audit-logs
- https://help.make.com/make-ai-agents-the-next-step-in-make
- https://community.make.com/t/introducing-credits-a-new-system-of-billing/89480
- https://community.make.com/t/important-update-adjustment-to-plans-and-pricing/94578
- https://community.make.com/t/data-transfer-limit/33041
- https://www.make.com/en/enterprise
- https://www.make.com/en/affiliate
- https://www.make.com/en/ngo-program
- https://www.make.com/en/academic-alliance
- https://www.make.com/en/blog/cloud-vs-self-hosted-automation
- https://www.make.com/en/product-description.pdf
- https://www.businesswire.com/news/home/20220222005231/en/Integromat-Evolves-to-Make-Expanding-Its-Vision-to-Empower-Creators-to-Innovate-Without-Limits
- https://www.lindy.ai/blog/make-com-pricing
- https://pxlpeak.com/blog/ai-tools/make-pricing-guide
- https://www.eesel.ai/blog/make-pricing
- https://zapier.com/blog/make-com-pricing/
- https://thedigitalprojectmanager.com/tools/make-pricing/
- https://hackceleration.com/make-review/
- https://4spotconsulting.com/make-com-changing-pricing-structure-what-you-need-to-know/
- https://dev.to/alifar/makecom-credits-explained-why-your-automations-suddenly-cost-more-4dho
- https://medium.com/@susanatoth-workflows/i-tested-make-coms-new-ai-agents-on-a-live-workflow-here-s-what-it-actually-costs-6fbf03d02e8e
- https://blog.n8n.io/make-vs-zapier/
- https://affylist.com/products/make
- https://getlatka.com/companies/integromat
