# Inglorious M.U.S.T.A.R.D.

**Every spec-driven tool assumes you can write a spec. MUSTARD assumes you can answer questions.**

MUSTARD is a seven-phase planning method for building software with AI agents. This CLI
operationalises it: it runs a **structured interrogation** with fixed multiple-choice questions,
free-text answers analysed by an LLM, and derived technical proposals, and emits a complete
planning bundle plus a queue of ready-to-paste prompts for your coding agent.

It **extracts** the specification instead of asking you to write one. It is bring-your-own-key,
free, open source, and agent-neutral. It does not write your application code but it makes you
capable of directing an agent that does.

```
npx inglorious-mustard
```

Requires **Node 20+**.

---

## What you get

After 20–40 minutes of guided questions, a `mustard/` directory appears in your repo:

```
mustard/
├── 00-BRIEFING.md      # One-page mission summary
├── 01-MANIFESTO.md     # Values and team rules
├── 01-AI-LAWS.md       # Machine-directed rules
├── 02-USE-CASES.md     # Actors, happy paths, failure paths
├── 03-SCHEMAS.md       # Models + Mermaid ER diagram
├── 03-STRUCTURE.md     # Proposed folder tree (matched to your stack)
├── 04-STACK.md         # Every technology choice, justified
├── 05-ARCHITECTURE.md  # Component + sequence diagrams
├── 05-DECISIONS.md     # ADR log; irreversible decisions flagged
├── 06-ROADMAP.md       # Dependency-ordered, agent-sized tasks
└── 07-PROMPTS/         # One ready-to-paste prompt card per task
```

Plus an adapter file at your repo root for the agent you chose — `CLAUDE.md`, `AGENTS.md`,
`.cursor/rules/`, `.github/copilot-instructions.md`, or `GEMINI.md`.

## The seven phases

| # | Phase | What it does |
|---|---|---|
| 0 | Recon | Literacy, agent target, provider/key setup *(not in the acronym)* |
| 1 | **M**anifesto | Why it exists, values, human + machine rules |
| 2 | **U**se cases & UI | Actors, capabilities, happy paths, and the **failure interrogation** |
| 3 | **S**chemas | Data models derived from your use cases |
| 4 | **T**ools & tech | Business questions → a justified, proposed stack |
| 5 | **A**rchitecture | Component/sequence diagrams + the irreversibility gate |
| 6 | **R**oadmap | Dependency-ordered, agent-sized tasks |
| 7 | **D**evelopment & docs | Prompt cards, adapter files, briefing |


## Bring your own key

No account, no subscription, no vendor markup. MUSTARD talks to your provider with your key, or
runs fully local and free via [Ollama](https://ollama.com).

Supported providers: **Anthropic**, **OpenAI**, **Google**, and **Ollama** (local).

Configure once:

```
mustard config set          # provider, model, API key
mustard config show         # current provider, model, key source
mustard config models --list
```

Every LLM call uses one model — your provider's strong tier by default, overridable with
`mustard config set --deep <model>`.

Keys are resolved in order: environment variable → `~/.mustard/config.json` (mode `0600`) →
your OS keyring (optional). Nothing is ever sent anywhere but your chosen provider.

## Commands

| Command | Behaviour |
|---|---|
| `mustard init` | Start a mission — creates `mustard/`, runs Phase 0. |
| `mustard resume` | Continue from the exact question where you stopped. |
| `mustard status` / `sitrep` | Phase progress, tasks done/total. |
| `mustard phase <n> --redo` | Re-run a phase; warns which downstream artifacts go stale. |
| `mustard prompts` | List prompt cards; print the selected card (with clipboard copy). Cards are listed in recommended build order; `--json` flags which are still blocked by dependencies. |
| `mustard config` | Provider, keys, models. |

Global flags: `--no-color`, `--json` (machine-readable output), `--dry-run` (interrogate, write
nothing). No work is ever lost — every answer is persisted on submission, so Ctrl-C at any point
costs you nothing; just `mustard resume`.

> `mustard export` (convert the bundle to Spec Kit / OpenSpec / other agent formats) is
> forthcoming.

## Development

```
pnpm install
pnpm build        # tsc -> dist/
pnpm test         # vitest
pnpm typecheck
pnpm lint         # biome
pnpm smoke        # pack the tarball + run a full mission from a clean install
pnpm golden       # golden-set scoring (offline rubric by default)
```

The golden set is the safety net for prompt edits. `pnpm golden` runs the deterministic
rubric offline; before merging a change to any system prompt, run it against a real
provider — `MUSTARD_LLM_MODE=real pnpm golden` (spends tokens; cap with
`MUSTARD_GOLDEN_MAX_PROJECTS=<n>`) — and compare `golden-scores.json` against `main`.

Releases are automated with [changesets](https://github.com/changesets/changesets): add a
changeset to your PR and merging the bot's "Version Packages" PR publishes to npm. See
[`dev/releasing.md`](dev/releasing.md).

## Licence

MIT. Based on the [M.U.S.T.A.R.D. method](https://github.com/nikoSchoinas/inglorious-mustard) by Nikos Schoinas.
