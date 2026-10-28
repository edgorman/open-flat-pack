# 7. Closed sets of values are strings, not enums

Status: Accepted

## Context

Some wire fields carry one of a closed set of values: `appv1.Slot.kind` is `"cell"` or `"surface"`. A proto3 `enum` would give a closed set of values on both sides.

## Decision

Keep a plain `string`, for three reasons together:

1. `protojson` serializes an enum by member name, so the wire value would become `KIND_CELL`: a rename of a value the frontend compares against (`slot.kind === 'cell'`), with no bug to fix.
2. proto3 requires a zero value, conventionally `_UNSPECIFIED`, but these fields have no unspecified state. An enum would add one that the backend then has to reject.
3. The server-side check already exists where the value enters: the catalogue loader (`internal/catalogue`) refuses a slot whose `kind` is neither value, so a bad catalogue fails at startup.

## Consequences

Weaker typing on the wire is the accepted cost; the backend validates every such value where it is read or written.
