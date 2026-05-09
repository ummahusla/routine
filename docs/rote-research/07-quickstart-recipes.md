# Quickstart Recipes

Common task patterns in plain CLI form. Copy, swap names, run.

---

## R1 — One-shot exploration

Goal: try an API, look at responses, throw the workspace away.

```bash
rote init scratch --seq
eval $(rote cd scratch)

rote adapter install open-meteo
rote open_meteo_probe "current weather" -s
rote open_meteo_call forecast '{"latitude":40.7,"longitude":-74,"current":"temperature_2m"}' -s
rote @2 '.current.temperature_2m' -r
```

Cleanup:
```bash
rote clean --pattern scratch
```

---

## R2 — Search before you build

Always.

```bash
rote flow search "list github issues"
rote flow search "summarize email"
rote registry flow search "stripe payouts"  --include-drafts
```

If a flow exists, run it. Done.

---

## R3 — Crystallize a working exploration

```bash
rote init list-repos --seq
eval $(rote cd list-repos)

rote set owner=modiqo
rote init-session adapter/github
rote github_call repos/list-for-user '{"username":"$owner"}' -t -s
rote @1 '.[] | {name, stargazers_count}' -r

rote export ~/.rote/flows/github/list-user-repos.sh \
  --params owner \
  --description "List all public repos for a user" \
  --tag github --tag repos \
  --atomic --release

rote flow index --rebuild
rote flow search "list user repos"
```

---

## R4 — Run a flow

```bash
rote flow run github/list-user-repos modiqo
# or directly:
~/.rote/flows/github/list-user-repos.sh modiqo
```

Inspect health:
```bash
rote flow health ~/.rote/flows/github/list-user-repos.sh
rote flow stats ~/.rote/flows/github/list-user-repos.sh --show-errors
```

---

## R5 — Compose flows with pipes

Atomic flows + Unix pipes.

```bash
~/.rote/flows/gmail/fetch-recent.sh 20 \
  | jq -r '.[].body' \
  | ~/.rote/flows/parallel/summarize-text.sh \
  | ~/.rote/flows/calendar/create-event.sh "Email Summary"
```

---

## R6 — Install an adapter from a spec

```bash
rote adapter new linear-api https://example.com/linear-openapi.json
# wizard: base URL → auth → headers → param cleaning → toolset selection → confirm

rote adapter list
rote adapter info linear-api
rote linear_api_probe "list issues" -s
rote linear_api_call issues/list '{"limit":10}' -s
```

Multi-tenant override:
```bash
rote adapter set airflow-api base_url https://myorg.astronomer.run/api/
```

---

## R7 — Install an adapter from a live MCP server

```bash
rote adapter new-from-mcp linear-mcp https://mcp.linear.app/mcp
# auto-discovers OAuth, registers a client, runs the auth flow
rote adapter list
```

---

## R8 — Share an adapter or flow

```bash
# adapter
rote adapter pack linear-api --output linear-api.adapt
rote registry adapter push linear-api.adapt my-org

# flow
rote registry flow push ~/.rote/flows/github/list-user-repos.sh my-org --check-deps
rote registry flow info my-org/list-user-repos
```

A teammate then:
```bash
rote registry adapter pull my-org/linear-api
rote registry flow pull my-org/list-user-repos
rote flow run my-org/list-user-repos rust-lang
```

---

## R9 — Resume after a context compaction

You explored yesterday, wrote a pending stub, started a new session today.

```bash
rote flow pending list
# → workspace=my-task, stub=list-repo-issues, adapter=adapter/github

rote flow pending save my-task
# → emits the exact `rote flow template create …` to run

# run it, test, release
rote flow release list-repo-issues
rote flow index --rebuild
```

---

## R10 — Iterate over an array

Run a per-item call.

```bash
rote github_call repos/list-for-user '{"username":"modiqo"}' -s
rote @1 '.[].full_name' -s repo_names

rote for @1 '.[]' --parallel \
  POST /github '{"query":"repo:$full_name issues"}' -t -s
```

---

## R11 — Conditions inside flows

```bash
if rote is-error @1; then
  echo "first call failed"
  exit 1
fi

if rote compare @2 '.status' -eq "ok"; then
  rote @2 '.data' -r
fi
```

---

## R12 — Diff two responses

```bash
rote diff @3 @5
rote diff @3 @5 '.items'
```

---

## R13 — Token / cost awareness

```bash
rote stats --save
rote ps --window 24h --detailed
rote ps --anomalies
```

---

## R14 — Browser automation via stdio

```bash
rote stdio quickstart
rote stdio add        # pick Playwright or Chrome DevTools
rote stdio start
rote stdio status
```

---

## R15 — Auth lifecycle

```bash
# OAuth
rote oauth authorize gmail \
  --auth-url https://accounts.google.com/o/oauth2/auth \
  --token-url https://oauth2.googleapis.com/token \
  --client-id $CLIENT --client-secret $SECRET \
  --scopes gmail.modify

# Static token
rote token set GITHUB_TOKEN ghp_xxxxxx
rote token list
rote token-info /github
rote token-valid /github
```

---

## R16 — Adapter policies

```bash
rote adapter policies github
rote adapter policies github --edit
rote adapter policies github --validate
```

Policy layers (low → high priority): built-in defaults → adapter defaults → user
overrides → workspace overrides.

---

## R17 — Cleanup hygiene

```bash
rote ls                       # list workspaces
rote clean --older-than=7d
rote clean --empty
rote clear -a                 # inside a workspace, drop all responses
rote adapter cleanup github   # drop stale workspace sessions
```

---

## R18 — Generate shell completions

```bash
rote completion fish | source
rote shell-setup fish --force >> ~/.config/fish/config.fish
```

---

## Pattern summary

| Verb | Command(s) |
|---|---|
| Discover | `rote flow search`, `rote explore`, `rote adapter catalog search` |
| Init | `rote init`, `rote cd`, `rote set` |
| Connect | `rote init-session`, `rote oauth authorize`, `rote token set` |
| Search a tool | `rote <adapter>_probe "<intent>" -s` |
| Execute | `rote <adapter>_call <tool> '{…}' -t -s` |
| Query | `rote @N '<jq>' -r [-s VAR]` |
| Compile | `rote export … --params … --tag … --atomic` |
| Reuse | `rote flow run`, pipe atomic flows |
| Share | `rote registry adapter\|flow push`, `pull`, `search` |
| Maintain | `rote flow doctor`, `rote flow validate --fix`, `rote fingerprint --refresh` |
