# ADR-001: customId Routing Convention

**Status**: Accepted
**Date**: 2026-10-31

> Provenance: the original ADR-001 was written before implementation and proposed a version prefix
> and an ID-shortening scheme. Neither was built. This record describes the convention **as
> shipped** in `bureaucrat/engine/discord/views/custom-id.ts`, which is the same framework that
> `keeper` carried forward and that was ported back here.

## Problem

Every non-command Discord interaction (button, select menu, modal submit) carries a `customId`
string set by the bot when the component was rendered. It is the sole mechanism for routing an
interaction back to the correct handler, and it is capped at **100 characters**. The router must
parse it at dispatch time to determine which handler to invoke and what IDs are in scope.

## Options

### Option A - Opaque UUID → DB lookup

Every component gets a random UUID; a registration table maps UUID → route + payload.

**Pros**: unlimited payload; route renames never break old messages; no character pressure.
**Cons**: a DB round-trip in the routing hot path, before Discord's 3-second deadline; rows
accumulate for every component ever rendered, making a TTL sweep mandatory; a missing row is
indistinguishable from an error.

### Option B - Structured path prefix (chosen)

`customId` is a delimited string encoding the route, the action, and the relevant IDs.

**Pros**: zero DB reads to route; readable in logs; mirrors the `::` convention already used by
slash command paths, so the handler map is a plain `Map.get`.
**Cons**: the handler key is frozen into already-rendered messages, so renaming a route strands old
buttons; the character budget bounds how many IDs can ride along.

### Option C - Abbreviated route plus session UUID

A compact route abbreviation and a full UUID pointing at a session row.

**Pros**: very short keys, leaving room for a full UUID.
**Cons**: abbreviated routes are opaque as the surface grows, and it still needs a session table
and a round-trip. It also conflates routing with state.

## Decision

**Option B.** The shipped format:

```
<path>::<action>::<id1>[:<id2>]
```

where `path` is `view::<viewId>`. For example:

```
view::queue::manage::a3f2b1c0-9e8d-7f6e-5a4b-3c2d1e0f9a8b
view::aclroles::edit::4e9d2c1b-1a2b-3c4d-5e6f-7a8b9c0d1e2f:0f4c6a2e-5b1d-4d3a-9c8e-1a2b3c4d5e6f
```

- **No version prefix.** Renaming a view id strands buttons on already-rendered messages; the
  mitigation is to avoid renaming ids, or to accept that standing messages must be re-spawned.
- **Full UUIDs**, not 8-character prefixes. The first id is always the view instance's own row id;
  further ids are positionally bound to the view's declared `idParams`, and `dispatch` overlays
  them onto `ctx.ids` under those names.
- `buildCustomId` throws if the result exceeds 100 characters.

## Consequences

- The 100-character cap is a real constraint on nesting depth. `view::` plus a view id plus an
  action plus one full UUID is roughly 60 characters, which leaves room for exactly one more id.
  A view needing several `idParams` will hit the ceiling - check the arithmetic before designing
  deep object chains.
- Components must be constructed through `view.customId(action, ...ids)` (injected by
  `injectCustomId`), never by string template, so the format cannot drift.
- An action a view cannot enumerate at definition time (a per-row button whose verb and target are
  both variable) is routed to the view's `'*'` handler, which reads `ctx.action` and splits it.
  Prefer `idParams` when the action is fixed and only the id varies.
- Because routing needs no database read, an interaction on a view whose row has been deleted
  simply falls through to a silent return in `dispatch` - stale buttons are inert, not errors.
