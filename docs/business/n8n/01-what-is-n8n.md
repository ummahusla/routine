# What Is n8n — Origin, Architecture, License, and Comparisons

> Raw research dossier. All quotes are verbatim from primary sources. Every fact includes a source URL.

---

## Official Homepage Descriptions

From the n8n.io homepage (fetched May 2026):

> "AI agents and workflows you can see and control"

> "Build visually, go deep with code, connect to anything. Every step of your agents' reasoning, traceable on the canvas. Deploy on your infrastructure or ours."

> "The world's most popular workflow automation platform for technical teams"

> "Plug AI into your own data & over 500 integrations"

> "Build AI agents you can actually follow"

> "Connect any model. Inspect every decision. Keep humans in the loop."

Additional feature copy from the homepage:

> "Automate business processes without limits on your logic"

> "Seamlessly move and transform data between different apps with n8n"

> "Explore +9500 workflow automation templates"

> "Get to prod faster — and with more flexibility than coding alone"

> "Handle multi-agent setups and RAG systems. Use multiple cloud or offline AI models."

> "Code when you need it, UI when you don't"

> "Write JavaScript or Python anywhere in your workflow"

> "Re-run single steps, not your entire workflow"

> "Move fast. Break nothing."

Source: https://n8n.io/

---

## Name Origin

From the n8n Press page (https://n8n.io/press/):

> - Always lowercase: "n8n"
> - Pronunciation: "n eight n"
> - Derived from "nodemation" (Node-View + Node.js + automation)

From the second anniversary blog post (https://blog.n8n.io/celebrating-n8n-second-anniversary/):

The name "nodemation" was chosen because the good domain names were taken. Jan Oberhauser chose it because 'node-' refers to its Node-View and use of Node.js, and '-mation' stands for 'automation'. The abbreviation follows the same convention as i18n (internationalization) and k8s (Kubernetes) — where the number represents the count of letters between the first and last.

From Wikipedia (https://en.wikipedia.org/wiki/N8n):

> n8n GmbH is "a German software company that provides a Visual programming language for automating workflows." The platform functions as a "low-code" and "fair code" workflow automation system using dataflow programming principles.

> The service offers "a visual node-based editor for automation involving other commercial and proprietary applications" with both self-hosted web service and managed cloud computing options.

---

## Founding and Origin

From the Taskade history article (https://www.taskade.com/blog/n8n-workflow-automation-history):

> **GitHub Launch:** June 23, 2019
> **Public Launch (Product Hunt + Hacker News):** October 2019

From the Solo Founders article (https://solofounders.com/blog/how-a-solo-founder-turned-a-side-project-into-a-2-5b-workflow-automation-giant):

> - 2019: Jan publishing first n8n version to GitHub while working on link.fish startup
> - June 23, 2019: First n8n version published
> - November 2019: Reached 10,000 GitHub stars within 5 months

From the n8n second anniversary blog (https://blog.n8n.io/celebrating-n8n-second-anniversary/):

> Jan created n8n because automating small tasks was time-consuming, requiring documentation reading, coding, GitHub commits, server deployment, error handling, SSL setup, and crash recovery. He worked on it as a side project while maintaining other startup involvement.

From the Accel podcast (https://www.accel.com/podcast-episodes/bonus-n8ns-jan-oberhauser-on-building-the-excel-of-ai), Jan Oberhauser stated:

> "I spent probably 90% of my time re-implementing things that have been implemented before. The most basic example is something like Get us down GitHub, send a message to Slack."

> "Why do I spend most of my time on reimplementing things that have been done and they're not very joyful to do?"

**Founding timeline from the Accel podcast:**
- 2018: First implementation began
- June 2019: Soft launch with initial user feedback
- October 2019: Proper launch; "it really took off"
- 1.5 years between initial idea and launch while working other startup jobs to support family

From the TechCrunch seed round article (https://techcrunch.com/2020/03/13/n8n-a-fair-code-workflow-automation-platform-raises-seed-from-sequoia-as-vc-firm-steps-up-in-europe/):

> The company was built as a side project while Oberhauser worked part-time elsewhere. He **declined Y Combinator to remain in Berlin with family.**

---

## What Problem It Solves

From the Sequoia podcast page (https://sequoiacap.com/podcast/training-data-jan-oberhauser/):

> "Our mission is to give technical people the powers of a 10x developer"

From the Accel podcast (https://www.accel.com/podcast-episodes/bonus-n8ns-jan-oberhauser-on-building-the-excel-of-ai):

> "I spent probably 90% of my time re-implementing things that have been implemented before."

Jan observed that "smart, capable people always depended on pipeline engineers" for automation, motivating him to build a tool empowering non-engineers.

From the TechCrunch Series A article (https://techcrunch.com/2021/04/26/n8n-raises-12m-for-its-fair-code-approach-to-low-code-workflow-automation/):

Founder Jan Oberhauser stated:
> "We want to give everyone technical superpowers, whether it's the marketing team or the IT department."

> "Almost every company needs help connecting outside and internal systems, to make it easier for people to get started."

n8n provides "a framework for both technical and non-technical people to synchronize and integrate data and workflows." The platform can connect more than 200 established applications plus custom apps and services (as of 2021; now 400+).

---

## Technical Architecture

From the n8n GitHub repository README (https://github.com/n8n-io/n8n):

> n8n is a workflow automation platform providing technical teams with code flexibility and no-code speed. It features 400+ integrations, native AI capabilities, and a fair-code license model.

**Key Capabilities:**
- "Code When Needed: Write JavaScript/Python, add npm packages, or use visual interface"
- "AI-Native: Build AI agent workflows based on LangChain with custom data and models"
- "Full Control: Self-host via fair-code license or use cloud offering"
- "Enterprise-Ready: Advanced permissions, SSO, air-gapped deployments"
- "Active Community: 400+ integrations and 900+ ready-to-use templates"

**Repository Statistics (as of May 2026):**
- 187k stars, 57.5k forks, 1.1k watchers
- 19,621 commits on master branch
- Primary language: TypeScript (91.1%)
- 616 releases, used by 877 projects

From the Jimmy Song deep-dive article (https://jimmysong.io/blog/n8n-deep-dive/):

> n8n employs a frontend-backend separated design. The visual editor allows users to design workflows through drag-and-drop node configuration, converting flows to JSON for backend processing. The workflow execution engine loads definitions from a database and processes tasks sequentially, with each node's output feeding into the next. The platform includes hundreds of built-in nodes for triggers and operations, written primarily in JavaScript/TypeScript.

**Architecture:**
- Implementation uses "Node.js and TypeScript"
- Workflows operate as "directed graphs of nodes"
- Queue mode supports worker process scaling for self-hosted deployments

**Node Types (from n8n Docs):**
1. Trigger Nodes: Start a workflow and supply the initial data. Activated by webhooks, schedules (cron), manual triggers, or events from third-party services.
2. Action Nodes: Perform operations as part of workflows. These include data manipulation and triggering events in other systems.

**Extension Levels (from Jimmy Song article):**
1. Function Code Nodes: Users can insert JavaScript code directly within workflows, supporting npm library imports
2. HTTP/API Integration: Built-in HTTP Request and Webhook nodes enable interaction with any external API
3. Custom Node Modules: The n8n-nodes-starter template supports both declarative (JSON-based) and programmatic (TypeScript-based) development

**Performance:**
- Community Edition runs as a single process by default
- Queue mode with Redis distributes tasks to multiple workers for parallel processing
- Concurrency can be limited through environment variables
- Minimum specs: 2-core CPU and 4GB RAM for most scenarios

**AI Architecture (70+ nodes as of 2024):**
- LangChain JavaScript/TypeScript library integrated via @n8n/n8n-nodes-langchain package
- AI Agent node: full ReAct or OpenAI Functions agent with configurable tool bindings, memory, and iterative reasoning loops
- Supports: Pinecone, Qdrant, Weaviate, Supabase pgvector, Redis, and in-memory vector stores
- Six node categories: Language Models, Chains, Agents, Memory, Vector Stores, and Utilities

From Wikipedia (https://en.wikipedia.org/wiki/N8n):

> As of December 2025, the platform "was being reported effective at linking and integrating data and functions between more than 350 established applications."

---

## License — Fair-Code and Sustainable Use License

### The Fair-Code Concept

From Jan Oberhauser's blog post "Fair-code: the future for sustainable open source alternatives" (https://blog.n8n.io/fair-code-for-sustainable-open-source-alternatives/):

> "I knew that if I open-source n8n, someone would come along and offer a hosted service on top of it."

He rejected open-core because:
> "it requires making the product artificially worse to make money. This would have degraded the quality of the product, and it seemed like a horrible idea."

He selected Apache License version 2 combined with the Commons Clause.

On calling it "open-source" (with quotation marks):
> "the source code is open, it can be forked and used for free by everybody, no matter if it is used by an individual or a company with 10,000 employees."

After n8n appeared on Product Hunt and Hacker News, critics accused him of being misleading. A GitHub issue titled "It's gaslighting to call it open source" accumulated over 330 comments.

Hacker News changed the post title from something like "n8n.io – Open source Zapier alternative" to "n8n.io – Workflow automation alternative to Zapier."

Oberhauser consulted with lawyers who confirmed: "calling the project open-source is legally correct, but I am not allowed to call it 'OSI-approved open-source'––which I didn't."

**Origin of "fair-code":**
> "Kenneth Malac, who participated in the GitHub discussions, reached out. They met in San Francisco in early 2020 and formulated the definition together, launching a website at faircode.io."

> **"n8n become the first official fair-code project."**

**The definition:**
> **"Fair-code means a project is generally free to use, and anybody can distribute it. It has its source code openly available, can be extended by anybody in public and private communities, and, most importantly, it is restricted commercially by its authors."**

> In short: "anyone can use the code for free but if one wants to make money with it, one has to pay."

**Why fair-code works:**
> "fair-code increases the chance of making the project long term financially viable"

> "Businesses...capture the value created by open-source projects and monetize it, with little to no return to the original developers. This doesn't feel fair."

From the Sequoia podcast (https://sequoiacap.com/podcast/training-data-jan-oberhauser/):
> "We never call ourselves open source because we don't have an OSI-approved license" but source code is freely available. Commercial use requires compensation.

### The Sustainable Use License (March 2022)

From the license change announcement (https://blog.n8n.io/announcing-new-sustainable-use-license/):

> n8n transitioned from "Apache 2.0 with Commons Clause" to the new Sustainable Use License on **March 17, 2022**.

**Two Main Differences from the previous license:**

1. **Redefined Permitted Use:** The previous arrangement "restricted users' ability to 'sell' the software"; the new license restricts use to "internal business purposes," creating "a clearer line for users."

2. **Removed Consulting Restrictions:** Previously, the license "restricted people's ability to charge fees for consulting or support services"; now "you are now free to offer commercial consulting or support services...without the need for a separate license agreement."

**Rationale for Custom License:**
> The company evaluated existing options but found "none fulfilled all our requirements." They note other companies (MongoDB, Confluent, Redis, Elastic, Cockroach) similarly "created their own licenses over the last few years with similar goals."

**Core Problem Addressed:**
> "Businesses...capture the value created by open-source projects and monetize it, with little to no return to the original developers. This doesn't feel fair."

From Wikipedia:
> The platform uses a "Sustainable Use License (SUL)" adopted March 2022, replacing previous Apache-2.0 plus Commons Clause licensing.

Current n8n GitHub description: "Fair-code workflow automation platform with native AI capabilities. Combine visual building with custom code, self-host or cloud, 400+ integrations."

---

## Self-Hosted vs. Cloud

From the n8n pricing page (https://n8n.io/pricing/):

**Self-hosted options:**
- Community Edition: Free, available on GitHub
- Business plan: Self-hosted only (€667/mo billed annually)
- Enterprise: Hosted by n8n or self-hosted

**Cloud options:**
- Starter: €20/mo billed annually (2,500 executions)
- Pro: €50/mo billed annually (10,000 executions)
- Enterprise: Custom

From the Sustainable Use License documentation:
- Self-hosting and internal use remain unrestricted
- Building competing SaaS platforms is prohibited
- OEM deployment available on all paid plans

Data storage for cloud: "data is stored within the EU — on servers located in Frankfurt, Germany"

---

## Comparison to Zapier and Make

From n8n's own comparison blog post (https://blog.n8n.io/make-vs-zapier/):

**Pricing Models:**
- Make: "Charge for each individual operation"
- Zapier: "Charge for each individual task"
- n8n: "Charge per workflow, no limit on tasks / steps"

n8n can be "1000 times more cost-efficient compared to Zapier or Make" for some automations, as "a single run counts only +1 towards the quota" regardless of complexity.

**Pre-built Connectors:**
- Make: 1,500+
- Zapier: 6,000+
- n8n: 1,000+ official (400+ per GitHub README, with community nodes extending further)

**Key Differentiators:**

| Feature | Make | Zapier | n8n |
|---|---|---|---|
| Self-hosting | No | No | Yes (free tier + Enterprise) |
| Custom JS/Python | Enterprise only | Limited | Built-in on all plans |
| Error handling | Advanced | Limited | Customizable error workflows |
| AI nodes | Limited | Limited | 70+ dedicated LangChain nodes |
| User management | Advanced roles | Team plan+ | Unlimited users, all plans |

From market analysis:
- Zapier: best for non-technical teams, 7,000+ apps, cloud-only
- Make: ideal for SMBs needing visual multi-step logic at competitive price
- n8n: top choice for developers and regulated industries needing self-hosted, open-source automation with native AI agent support

**Strategic Partners** (from n8n.io/partners/):
- SAP
- AWS
- Deutsche Telekom
- Microsoft

---

## AI/LangChain Integration

From the Sequoia podcast (https://sequoiacap.com/podcast/training-data-jan-oberhauser/):

> "We not just added AI features, we actually allowed people to build AI-powered applications with n8n."

> "You can use whatever is best for your use case, and that is what makes it so powerful."

Jan described the AI pivot: Six weeks from decision to first AI release. Early version included "an agent, you change all the problems, you can add your different LLMs, you can have a vector store, you can have a memory, you can have multiple agents."

Key advantage:
> Combining "human code and ai" rather than "relying to a hundred percent on ai."

From the 2024 year-in-review (https://blog.n8n.io/2024-in-review/):

New AI features launched in 2024:
- Chat Trigger with improved canvas chat and logging
- Support for Claude, Gemini, Groq, and Vertex AI models
- External Vector Stores integration
- AI Transform Node and AI App Tools
- AI Agents for autonomous workflows
- Self-Hosted AI Starter Kit for private infrastructure deployment

By late 2025:
> "75% of customers now use AI features" (Sequoia podcast)
> "75% of workflows now include LLM integrations" (Highland Europe press release)
