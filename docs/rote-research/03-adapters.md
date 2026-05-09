# Adapters

An **adapter** turns any API spec or live MCP endpoint into a local, searchable,
MCP-compatible tool surface. From the user's view it exposes exactly three virtual
tools — `probe`, `call`, `batch_call` — regardless of how many operations the underlying
API has.

> Mental model: an adapter *is* the API. Not a server wrapping it — a local artifact
> rote can search and execute against in-process.

---

## Adapter types

| Type | Source format | Typical examples |
|---|---|---|
| OpenAPI | OpenAPI 3.x JSON / YAML | GitHub, Stripe, Slack |
| GraphQL | GraphQL schema | GitHub GraphQL, Shopify |
| gRPC | `.proto` + reflection | internal services |
| Google Discovery | Discovery JSON | Gmail, Drive, Calendar |
| MCP server | live `https://…/mcp` URL | Linear MCP, Notion MCP |
| Static data | JSON file | local fixtures |

The distinction is transparent at usage time — every adapter is invoked the same way.

---

## Authentication models

Auth is detected by inspecting the spec or the MCP endpoint at install time. The user
confirms or overrides during the wizard.

| Type | Detected from | Stored as |
|---|---|---|
| None | public endpoints | — |
| Bearer token | `securitySchemes: bearer` | `rote token set <KEY>` |
| API key | header / query param schemes | encrypted token vault |
| Basic auth | `securitySchemes: basic` | encrypted vault |
| OAuth 2.0 | `oauth2` flows in spec or MCP discovery | `rote oauth authorize` |
| Per-operation | mixed schemes per endpoint | wizard splits per route |

Credentials are encrypted at rest, scoped per adapter, and isolated from other adapters.

Inspect or update auth at any time:
```bash
rote adapter update-auth <id>
rote token list
rote token-info <endpoint>
```

---

## Discovering adapters

```bash
# What is installed
rote adapter list

# Browse the built-in catalog (50k+ APIs from awesome-openapi-specs etc.)
rote adapter catalog
rote adapter catalog search "github"
rote adapter catalog info <id>

# Org-shared adapters
rote registry adapter search "stripe"
rote registry adapter info <org>/<name>
```

---

## Installing an adapter

### From the catalog

```bash
rote adapter install stripe
rote adapter install github-api
```

Pulls a pre-vetted, pre-fingerprinted adapter from the catalog.

### From a spec URL

```bash
rote adapter new github-api \
  https://raw.githubusercontent.com/github/rest-api-description/main/openapi.json
```

Opens a 6-step wizard:

1. **Base URL** — confirm or override (auto-detected from the spec).
2. **Authentication** — select method, store credentials.
3. **Additional headers** — anything the spec doesn't carry.
4. **Parameter cleaning** — strip test/internal params.
5. **Toolset selection** — choose which endpoint groups to enable.
6. **Confirmation** — fingerprint, finalize, build the search index.

Toolsets are detected automatically using:

- Path prefixes (`/repos`, `/issues`, …)
- Naming patterns (`getUser`, `listUsers`, `createUser` → `users`)
- OpenAPI `tags`
- Semantic clustering on names + descriptions

### From a live MCP endpoint

```bash
rote adapter new-from-mcp linear https://mcp.linear.app/mcp
```

Auto-discovers OAuth, registers a client, and runs the authorization flow.

### From a `.adapt` archive (sharing)

```bash
rote adapter pack github-api --output github-api.adapt
rote adapter check github-api.adapt
rote adapter install github-api.adapt
rote registry adapter push github-api.adapt my-org
rote registry adapter pull my-org/github-api
```

---

## Calling an adapter

The three-tool pattern is the entire user-facing API for any adapter.

### `_probe` — find the right tool

```bash
rote github_api_probe "list user repositories" -s
rote github_api_probe "create issue" --toolset issues --limit 5 -s
```

Searches an indexed catalog of operations and returns ranked results. Options:

- `--toolset <name>` — restrict to one group
- `--limit <n>` — cap results (default 10, max 50)
- `-s` — auto-create / reuse session
- `-t` — enable `$var` substitution

### `_call` — execute one tool

```bash
rote github_api_call repos/get \
  '{"owner":"facebook","repo":"react"}' -s

rote github_api_call issues/create \
  '{"owner":"$owner","repo":"$repo","title":"Bug"}' -t -s
```

Result lands in the next response cell (`@N`); query it with `rote @N '…'`.

### `_batch_call` — execute many in parallel

```bash
rote github_api_batch_call '[
  {"tool_name":"repos/get",   "arguments":{"owner":"x","repo":"y"}},
  {"tool_name":"issues/list", "arguments":{"owner":"x","repo":"y"}}
]' -s
```

Calls run concurrently; combined result lands in one cell.

---

## Adapter naming

| Form | Where used | Example |
|---|---|---|
| Hyphenated | adapter ID on disk | `github-api`, `stripe-live` |
| Underscored | shorthand commands | `github_api_probe`, `stripe_live_call` |

rote converts between them automatically. Pick one ID at install time.

---

## Adapter scoping

| Scope | Path | Effect |
|---|---|---|
| Global | `~/.rote/adapters/<id>/` | available to every workspace |
| Workspace | `<workspace>/.rote/adapters/<id>/` | overrides global for that workspace |
| Toolset | `<adapter>/toolsets/<name>.json` | enable / disable per toolset |

Use `rote adapter set <id> <key> <value>` to override mutable manifest keys per scope
(e.g. `base_url` for multi-tenant APIs).

---

## Adapter creation pipeline (autonomous mode)

The bundled `rote-adapter` skill (also shipped via pi-rote) orchestrates a deterministic
8-phase pipeline when creating a new adapter:

| # | Phase | What happens |
|---|---|---|
| 1 | Discovery | Locate spec (catalog, user URL, GitHub) |
| 2 | Analysis | Dry-run the spec; detect toolsets and auth |
| 3 | Research | Cross-reference base URL and auth with official docs |
| 4 | Authentication | Store credentials in the encrypted vault |
| 5 | Scope | User picks toolsets and access levels (read-only vs. write) |
| 6 | Create | `rote adapter new` with pre-made decisions |
| 7 | Post-creation safety | Initialize write guard, classify sensitive ops |
| 8 | Verification | End-to-end test (session, probe, call) |

Every gate (base URL, auth, toolsets, write access) requires explicit user confirmation.

---

## Installed adapter file layout

Conceptual layout (no source-level detail):

```
~/.rote/adapters/<id>/
├── manifest.json          # name, version, base_url, auth, fingerprint, statistics
├── capabilities.json      # which capabilities are exposed
├── tools.json             # full operation schemas
├── spec.json              # normalized original spec
├── toolsets/
│   └── <name>.json
├── index/
│   ├── tools/             # search index (driving probe)
│   └── toolsets/
└── runtime/
    ├── auth.json          # encrypted credentials
    ├── enabled_toolsets.json
    └── cache/             # optional response cache
```

`rote adapter info <id>` prints the relevant subset.

---

## Policies

Each adapter carries runtime policies merged from four layers (lowest priority first):

1. Built-in defaults (conservative)
2. Adapter defaults (shipped with the install)
3. User overrides (`~/.rote/adapters/<id>/config/policies.json`)
4. Workspace overrides (`<workspace>/.rote/adapter_policies/<id>/policies.json`)

Configurable knobs:

| Policy | Purpose |
|---|---|
| Rate limiting | Quota enforcement (e.g. 1.4 req/s) |
| Timeouts | Request / read |
| Retry | Attempts on 5xx |
| Circuit breaker | Open after N failures, cool down |
| Size limits | Request / response payload caps |
| Caching | TTL, max size |
| Cost tracking | Daily / monthly spend caps |
| Logging | PII redaction, sampling |
| Credentials | Refresh, expiry handling |

Inspect / edit:
```bash
rote adapter policies <id>
rote adapter policies <id> --edit
rote adapter policies <id> --validate
```

---

## Drift detection (fingerprints)

Every adapter has a stable **fingerprint** derived from its API identity (server name,
version, tool schemas). Flows compiled against an adapter embed that fingerprint. When
the API changes shape, fingerprint mismatch surfaces as a flow health warning so the
flow can be re-crystallized before it runs against a drifted API.

```bash
rote fingerprint <endpoint>
rote fingerprint --list-global
rote fingerprint --refresh
```

---

## Example adapters in the wild

Pre-vetted catalog entries (not exhaustive):

- **Stripe** — payments / payouts
- **GitHub** — REST + GraphQL
- **Linear** — issue tracking (MCP)
- **Telegram Bot API**
- **OpenAI Codex**
- **Polymarket** (gamma, CLOB, API)
- **Open-Meteo** / **Wunderground**
- **Google Drive / Gmail / Calendar** (via Discovery)
- **Test adapters** (`e2e-apikey`, `e2e-bearer`, `e2e-perop`) for harness use

---

## Mental shortcut

```
install   → rote adapter install <id>            # or rote adapter new <id> <spec>
discover  → rote <id>_probe "<intent>" -s
execute   → rote <id>_call <tool> '{…}' -s -t
batch     → rote <id>_batch_call '[ … ]' -s
inspect   → rote @N '.path' -r
```

Every adapter is the same five lines.
