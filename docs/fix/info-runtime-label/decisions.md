# Info panel reports `unknown runtime` — decisions

## Scope

The Info plugin rendered `runtime unknown` for both components because the browser parsers in
`src/client/src/api/parsers.ts` copied the server payload field by field and never copied `runtime`
or `runtimeEngine`. The API already sent both, so the defect never showed up in the HTTP response,
only in the UI label.

## Decisions

- One field parser (`parsePiWebRuntimeFields` in `src/shared/piWebStatusParsing.ts`) now owns the
  accepted `runtime`/`runtimeEngine` values, and both the shared parser and the client parsers use
  it. A second hand-written copy is how the fields went missing in the first place.
- An unknown or absent runtime is dropped, not guessed: the label stays `runtime unknown` for a
  peer that predates runtime reporting, and a component never inherits another's runtime.
- The client keeps its strict "throw on malformed payload" contract; only the runtime fields are
  delegated to the shared rule, so a bad `installation` still fails loudly.

## Path protection records

```text
path-protection-records@1
kind | paths | phase | date | authority | justification
justification | src/client/src/api/parsers.test.ts | P1 | 2026-10-21 | execute-phase | Adds the regression coverage for the reported defect: the client parsers dropped the runtime fields the API sends, so the Info panel always rendered "runtime unknown".
```
