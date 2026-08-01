# LLM replay fixtures

Recorded model responses for the record/replay transport (technical-plan §2.3).
Every routine test run replays these — zero tokens, no API key. A fixture is keyed
by `(pass, promptVersion, schemaHash, inputHash)`, so any drift in a system prompt
or an output schema turns a stale replay into a loud cache-miss instead of a silent
wrong answer.

## Provenance

`analyse/` and `synthesise-manifesto/` are **golden project #1** (the single-user
habit tracker) for M6. `extract/` and `suggest-capabilities/` continue it for Phase
2A (M8); `happy-path/`, `failure-questions/`, `failure-structure/` and
`order-use-cases/` continue it for Phase 2B (M9); `propose-enum-values/` continues it
for Phase 3 (M10); `propose-stack/`, `explain-stack/` and `propose-structure/` continue
it for Phase 4 (M11). They were generated deterministically from canned responses through
the real record path because no provider key was available at authoring time.

To refresh them against a real provider (the intended Anthropic recording), run the
mission with a key and `MUSTARD_LLM_MODE=record`. As long as the scripted answers,
prompt versions and schemas are unchanged, the fixture keys — and therefore the file
paths — stay identical, so a real recording overwrites these in place and nothing
else needs to change.

Regenerate the seed fixtures with:

```
npx tsx tests/golden/record.ts          # M6  — analyse, synthesise-manifesto
npx tsx tests/golden/record-phase2.ts   # M8  — extract, suggest-capabilities
npx tsx tests/golden/record-phase2b.ts  # M9  — happy-path, failure-*, order-use-cases
npx tsx tests/golden/record-phase3.ts   # M10 — propose-enum-values
npx tsx tests/golden/record-phase4.ts   # M11 — propose-stack, explain-stack, propose-structure
```
