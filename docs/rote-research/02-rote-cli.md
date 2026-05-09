# rote CLI Reference

Complete command surface, grouped by domain. Every command is invoked as `rote <command> …`.
Most commands require `rote login` first (registry-bound commands always do).

> Tip: `rote help [command]` and `rote guidance agent` give live, embedded documentation.

---

## Workspace management

| Command | Purpose |
|---|---|
| `rote init <NAME> [--seq\|--par\|--par=N] [--vendor=V] [--config=P] [--force]` | Create a workspace. `--seq` = sequential execution, `--par[=N]` = parallel. `--vendor` overrides MCP vendor detection (Cursor / Claude). |
| `rote ls [--flat] [--verbose] [--show-requests] [--show-requests-full]` | List workspaces (run globally) or list responses (run inside a workspace). |
| `rote cd <NAME>` | Outputs a `cd` command for shell `eval`: `eval $(rote cd <name>)`. |
| `rote where` | Print path of the active workspace. |
| `rote clean [--older-than=Nd] [--empty] [--pattern=P] [--all]` | Remove workspaces by age, emptiness, or glob. |
| `rote clear [@ID \| -a]` | Drop one response (`@1`) or all (`-a`) from current workspace. |
| `rote action-id` | Print current workspace action ID (used by anti-pattern detection). |

---

## HTTP & response caching

Every HTTP command stores its response as the next numbered cell (`@1`, `@2`, …).

| Command | Purpose |
|---|---|
| `rote POST <ENDPOINT> <BODY> [-s] [-t] [--id-only]` | POST request. `-s` reuses a session. `-t` enables `$var` and `@N{.path}` substitution in the body. |
| `rote GET <ENDPOINT> [-s] [--id-only]` | GET request. |
| `rote PUT <ENDPOINT> <BODY> [-s] [-t]` | PUT request. |
| `rote DELETE <ENDPOINT> [-s]` | DELETE request. |

Parallel form:
```bash
rote -p POST /a '{}' -s   POST /b '{}' -s   POST /c '{}' -s
```
Runs three requests concurrently; results land at `@1`, `@2`, `@3`.

---

## Querying cached responses

```bash
rote @<ID> <QUERY> [-s VAR] [-m] [-r]
```

- `-s VAR` — save the result as a workspace variable
- `-m` — unwrap MCP envelope (`.content[0].text → JSON`)
- `-r` — raw output (no quoting)
- `rote query-stdin <QUERY>` — same engine, reads JSON from stdin

The query engine is jq-compatible. Highlights:

| Domain | Operators |
|---|---|
| Encodings | `@json`, `fromjson`, `@yaml`, `@base64`, `@base64d`, `@text` |
| Strings | `split / join / upper / lower / trim / contains / starts_with / ends_with` |
| Arrays | `length / first / last / .[] / flatten / unique / sort` |
| Math | `+ - * / %`, `round`, `floor`, `ceil` |
| Filters | `select(cond)`, `map(expr)`, `has("key")` |
| Logic | `==`, `!=`, `>`, `<`, `>=`, `<=`, `and`, `or`, `not`, `//`, `if-then-else-end` |

Example:
```bash
rote @1 '.result.tools[] | select(.name | contains("list"))' -r
rote @2 '.data[0].id' -s first_id
```

---

## MCP shorthand

Wraps common MCP JSON-RPC calls so you don't write the envelope by hand.

| Command | Purpose |
|---|---|
| `rote init-session <ENDPOINT>` | MCP `initialize` against an endpoint. |
| `rote tools <ENDPOINT> [--names-only] [-s]` | MCP `tools/list`. |
| `rote resources <ENDPOINT>` | MCP `resources/list`. |
| `rote prompts <ENDPOINT>` | MCP `prompts/list`. |
| `rote read <ENDPOINT> <URI>` | MCP `resources/read`. |
| `rote prompt <ENDPOINT> <NAME> [k=v …]` | MCP `prompts/get` with arguments. |

---

## Template variables

| Command | Purpose |
|---|---|
| `rote set <NAME>=<VALUE>` | Set a workspace variable. |
| `rote vars [--json]` | List variables. |

Use with `-t`:
```bash
rote set org=modiqo
rote POST /github '{"org":"$org"}' -t
```

---

## Adapters

### `rote adapter` subcommands

| Subcommand | Purpose |
|---|---|
| `new <ID> <SPEC> [--yes]` | Create an adapter from an OpenAPI / GraphQL / gRPC / Discovery spec. Indexes operations in ~30s. |
| `new-from-mcp <ID> <URL>` | Create an adapter from a running MCP endpoint (auto-discovers OAuth). |
| `list` | List installed adapters with fingerprints. |
| `info <ID>` | Adapter details, stats, fingerprint. |
| `keys <ID>` | List mutable manifest keys (`base_url`, `description`, …). |
| `set <ID> <KEY> <VALUE>` | Mutate a key (e.g. multi-tenant `base_url`). |
| `update-auth <ID>` | Re-run the auth wizard. |
| `remove <ID>` | Uninstall. |
| `pack <ID> [--output O]` | Bundle as `.adapt` archive. |
| `install <ARCHIVE>` | Install from `.adapt`. |
| `check <FILE>` | Verify `.adapt` integrity. |
| `sessions <ID>` | List workspaces using this adapter. |
| `cleanup <ID>` | Drop stale workspace sessions. |
| `reindex [<ID> \| --all]` | Rebuild the adapter search index. |
| `policies [<ID>] [--list \| --edit \| --validate]` | Manage rate limits, retries, costs. |
| `catalog` | Browse the built-in adapter catalog. |
| `catalog search "<KEYWORD>"` | Search the catalog. |
| `catalog info <ID>` | Show a catalog entry. |

### Adapter shorthand (per-adapter virtual tools)

For an adapter installed as `<id>` (hyphens become underscores in commands):

| Command | Purpose |
|---|---|
| `rote <id>_probe "<intent>" [--toolset T] [--limit N] [-s]` | Semantic search for matching tools. |
| `rote <id>_call <TOOL> '{ … }' [-s] [-t]` | Execute one tool. |
| `rote <id>_batch_call '[ … ]' [-s]` | Execute many tools concurrently. |

Example:
```bash
rote adapter install stripe
rote stripe_probe "create invoice" -s
rote stripe_call invoices/create '{"customer":"$cust"}' -t -s
```

---

## Flows

### `rote flow` subcommands

| Subcommand | Purpose |
|---|---|
| `list [--unhealthy] [--json]` | List installed flows. |
| `search <QUERY> [--explain]` | Semantic search across the flow catalog. |
| `health <PATH>` | Show flow health (skip ratio, dirtiness, anti-patterns). |
| `doctor` | Run health checks across all flows. |
| `stats <PATH> [--show-errors]` | Execution stats: time, tokens, success rate. |
| `validate <PATH> [--fix]` | Validate flow format. `--fix` repairs minor issues. |
| `index [--rebuild]` | Manage the search index. |
| `run <FLOW> [PARAMS …] [--dry-run] [--resume ID]` | Execute a flow with DAG-aware step execution. |
| `template create --name <NAME> --adapter <ADAPTER>` | Scaffold a new flow with SDK best practices. |
| `frontmatter --name <NAME> --adapter <ADAPTER>` | Generate YAML frontmatter for discovery. |
| `bless <flow-name>` | Approve write permissions for a flow. |
| `release <flow-name>` | Promote draft → released (visible to search). |
| `pending list` | List pending flow stubs across workspaces. |
| `pending write <workspace> --name … --adapter … --response-path … --notes …` | Create a stub. |
| `pending save <workspace>` | Materialize a stub into a flow scaffold command. |

### Flow export & replay

| Command | Purpose |
|---|---|
| `rote export <FILE> [--params p1,p2] [--description D] [--tag T …] [--atomic] [--release]` | Compile the active workspace trace into a reusable flow. Removes failed attempts, parameterizes, fingerprints. |
| `rote decompile <FLOW> [--output O] [--verbose]` | Reverse a compiled flow back into a command log. |
| `rote replay [k=v …]` | Re-execute a decompiled command set with parameter substitution. |

---

## Iteration & display

| Command | Purpose |
|---|---|
| `rote for @N <QUERY> [--parallel] POST <EP> <BODY> [-t] [-s]` | Iterate an array; run a command per item. `--parallel` runs concurrently. |
| `rote display @N..@M [--base PATH] --field name=path …` | Format multiple responses as a table. |

---

## Conditions (exit 0 = true, 1 = false)

Useful inside generated flow scripts.

| Command | Checks |
|---|---|
| `rote is-error @N` | Response contains an error. |
| `rote is-auth-error @N` | Auth-class error. |
| `rote any-auth-error @N..` | Any of the listed responses has an auth error. |
| `rote exists @N <QUERY>` | Field exists. |
| `rote has-session <ENDPOINT>` | Session exists. |
| `rote is-empty @N <QUERY>` | Query result is empty. |
| `rote compare @N <QUERY> <OP> <VALUE>` | `-eq / -gt / -lt / -match / -contains`. |
| `rote has-var <VAR>` | Variable defined. |
| `rote changed @OLD @NEW <QUERY>` | Value changed across responses. |
| `rote all-success @N..` | All responses succeeded. |
| `rote any-error @N..` | Any response erred. |
| `rote is-type @N <QUERY> <TYPE>` | `string / number / bool / array / object / null`. |
| `rote expect @N <PATH1> <PATH2> …` | All listed fields exist. |

---

## Registry & distribution

### Auth

| Command | Purpose |
|---|---|
| `rote registry register` | Create an account. |
| `rote registry login [--provider google \| github \| email]` | Authenticate. |
| `rote registry logout` | Revoke tokens. |
| `rote registry whoami [--verbose]` | Current user. |

### Adapter sharing

| Command | Purpose |
|---|---|
| `rote registry adapter push <FILE>.adapt <ORG>` | Upload a packed adapter. |
| `rote registry adapter pull <ORG>/<NAME>` | Download. |
| `rote registry adapter list [--org O]` | List adapters. |
| `rote registry adapter search <QUERY> [--limit N]` | Search. |
| `rote registry adapter info <ORG>/<NAME> [--show-flows]` | Details. |

### Flow sharing

| Command | Purpose |
|---|---|
| `rote registry flow push <FLOW> <ORG> [--check-deps]` | Upload. |
| `rote registry flow pull <ORG>/<NAME>` | Download. |
| `rote registry flow list [--mine] [--json]` | List flows. |
| `rote registry flow search <QUERY> [--include-drafts]` | Search. |
| `rote registry flow info <ORG>/<NAME>` | Details. |
| `rote registry flow delete <ORG>/<NAME>` | Delete. |

### Orgs & teams

| Command | Purpose |
|---|---|
| `rote registry org list` | List orgs. |
| `rote registry org create --slug <S> --name "<N>"` | Create org. |
| `rote registry org invite <ORG> <USER> [--role admin]` | Invite member. |
| `rote registry org team create <ORG> <TEAM>` | Create team. |
| `rote registry org team add <ORG> <TEAM> <USER>` | Add member. |

---

## Authentication & tokens

| Command | Purpose |
|---|---|
| `rote oauth authorize <NAME> --auth-url U --token-url T --client-id I --client-secret S [--scopes S …]` | Run an OAuth code-grant flow; encrypted token stored. |
| `rote token set <KEY> <VALUE>` | Store an encrypted token. |
| `rote token get <KEY>` | Retrieve. |
| `rote token list` | List tokens with OAuth metadata. |
| `rote token delete <KEY>` | Delete. |
| `rote token-valid <ENDPOINT>` | Validate (JWT or opaque). |
| `rote token-info <ENDPOINT>` | Expiry, scopes, claims. |
| `rote get-token <ENDPOINT> [--strip-bearer]` | Print raw token (scripting). |

---

## Configuration & profile

| Command | Purpose |
|---|---|
| `rote config check [--verbose]` | Inspect Cursor / Claude Desktop configs; recommend a vendor. |
| `rote fingerprint [<ENDPOINT>] [--list-global] [--clear-global] [--refresh]` | Manage API fingerprints (drift detection). |
| `rote profile init [--name N] [--email E] [--org O]` | Initialize provenance tracking. |
| `rote profile show / set` | Inspect / update the profile. |
| `rote model set <MODEL> --provider <PROVIDER>` | Record the exploration model on workspaces. |
| `rote model show / list` | Inspect model state. |
| `rote endpoint-check <ENDPOINT> [FINGERPRINT]` | Validate an endpoint is up. |

---

## Data ops

| Command | Purpose |
|---|---|
| `rote inject <FILE> [--as N]` | Inject a JSON / YAML file as a fake response (for testing). |
| `rote diff @OLD @NEW [<QUERY>]` | Diff two responses. |
| `rote aggregate --from @N <Q> --as VAR …` | Combine fields from multiple responses. |
| `rote compose-email --to ADDR --subject TEXT [--body-from @N] [-s VAR]` | Build an RFC-2822 email (Gmail draft API). |

---

## Stdio & browser automation

| Command | Purpose |
|---|---|
| `rote stdio quickstart` | Quick-start guide. |
| `rote stdio add` | Add a stdio server (Playwright, Chrome DevTools, …). |
| `rote stdio start / stop / status` | Control the stdio daemon. |
| `rote daemon <start \| stop \| restart \| status>` | Legacy daemon control. |

---

## Analytics & observability

| Command | Purpose |
|---|---|
| `rote ps [--endpoint E] [--detailed] [--errors] [--anomalies] [--window 1h \| 24h \| 7d]` | Endpoint health & performance. |
| `rote plan` | DAG analysis; spot parallelism opportunities. |
| `rote stats [--save]` | Token consumption stats across the workspace. |
| `rote show-actions [--workspace W]` | Action log. |

---

## Anti-pattern detection

| Command | Purpose |
|---|---|
| `rote detect <ACTION_ID>` | Analyze a workflow for anti-patterns; suggest improvements. |

---

## Help & guidance

| Command | Purpose |
|---|---|
| `rote help [COMMAND]` | Built-in help. |
| `rote how` | Full onboarding guide. |
| `rote guidance <TOPIC> [MODULE]` | Embedded guidance: `agent`, `adapters`, `browser`, `script`. Modules: `essential`, `full`. |
| `rote man <TOPIC> [MODULE]` | Same content, man-page style. |
| `rote why` | Value proposition. |
| `rote machine [story \| adapters \| workspace \| tokens \| inventory \| health \| skills \| search]` | Machine-readable architecture facts (for agents). |
| `rote explore "<intent>"` | Discover which adapter / tool can satisfy an intent. |

---

## Shell integration

| Command | Purpose |
|---|---|
| `rote shell-setup [bash \| zsh \| fish] [--force]` | Print shell rc additions (e.g. the `rote-cd` alias). |
| `rote completion <bash \| zsh \| fish>` | Generate shell completions. |

---

## DSL (experimental)

| Command | Purpose |
|---|---|
| `rote run <FILE> [args …] [--new-workspace]` | Execute a `.rote` DSL file. |
| `rote compile <INPUT> [--output O]` | Compile the DSL to a shell script. |

DSL example:
```rote
flow my_flow {
  github {
    session = init()
    tools   = list_tools()
  }
  output {
    count = github.tools.result.tools | length
  }
}
```

---

## Environment variables

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` / `GMAIL_TOKEN` / `ELEVENLABS_API_KEY` / … | Service credentials looked up by adapters. |
| `ROTE_VENDOR` | Override MCP vendor auto-detection. |
| `ROTE_LICENSE_KEY` | Pro-tier license. |
| `ROTE_HOME` | Override the rote root (default `~/.rote`). |

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success / condition true |
| `1` | Error / condition false |

---

## Most-common workflow

```bash
rote init my-flow --seq
rote init-session /github
rote tools /github -s
rote @1 '.result.tools[0].name' -r

# … exploration with probe / call / @N queries …

rote export my-flow.sh --tag github --params owner,repo
rote registry flow push my-flow.sh my-org
```
