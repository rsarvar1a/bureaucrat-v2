# ADR-003: View State, Ancestry, and the Subscription Graph

**Status**: Accepted
**Date**: 2026-10-31

> Provenance: supersedes this repository's ADR-002 (ephemeral session state) and ADR-004 (context
> resolution). Neither shipped as written - there is no `InteractionSession` table and no `needs`/
> `ResolvedContext` machinery. What shipped is described here, and ADR-004's channel→game
> resolution is not carried over at all: location is state, not Discord topology.

## Problem

Three questions, which the two superseded records answered separately and which the shipped design
answers together:

1. Where does multi-step interaction state live between interactions?
2. How does a nested view know which domain entity it is operating on?
3. How does a change made in one view reach every other view that displays it?

## Decision

### 1. State: view rows, with domain state in the domain

Each view instance is a row in `abc.View` carrying a JSONB `state` column. That state is for
**interface** concerns - which signup is selected, whether a confirm button is armed - and is
patched with `ctx.updateState(patch)`.

Domain state does not live there. It lives in `core`, and views read it in `render`. The queue
panel is the worked example: it renders `core.Queue` and `core.QueueEntry`, and its own view state
holds only the thread it opened.

At spawn, caller-supplied state is **merged over** `defaultState` (`mergeState`), so a caller may
pass only the fields it has. Defaults are merged at spawn only, never on load: a field added to a
long-lived view must be optional and defaulted where it is read.

Which face a pane is showing is interface state too. A tabbed pane (`qmanage`, `aclroleedit`)
holds its active tab in state and reads it through the `tabs` component, which falls back to a
declared default when the field is missing or names a tab that no longer exists - the case for a
pane that was open before a tab was added or renamed.

Multi-step flows use **ephemeral child views** rather than a session table. An ephemeral view is
bound to a `member` and flagged `autoExpires`; the sweep collects it once `updatedAt` is older than
`TEMPORARY_VIEW_TIMEOUT_MS`, and every dispatched interaction refreshes `updatedAt`. Spawning a
second one for the same route and member invalidates the first.

### 2. Ancestry: ids flow down, entities are inherited

`spawnView` records a `parent`, and `resolveAncestry` walks that chain with a recursive CTE,
producing a map of `route → entityId ?? id` for every ancestor including self. A child with no
explicit `entityId` inherits its parent's.

The practical effect: a child view knows what it is operating on without being passed anything.
The queue manage pane reads `view.entityId` and gets the queue its parent panel is bound to, purely
because it was spawned from that panel's context.

Ancestors closer to the current view win on key collision, so a child's own id shadows a
grandparent's for the same route.

`abc.View.parent` cascades on delete. Never spawn a public view beneath an ephemeral one: its row
would vanish when the parent is swept, leaving a dead message.

### 3. The subscription graph: events, not references

A view declares what it listens for:

```typescript
subscribesTo: { render: [QueueEvents.EntriesChanged], destroy: [QueueEvents.Destroyed] }
```

Context labels are template strings interpolated against the ancestry ids map:

```typescript
export const QueueEvents = {
  EntriesChanged: 'queue::${queue}::entries',
} as const;
```

At spawn time, templates resolve to concrete labels and are written to `abc.Subscription`. Any
handler calling `ctx.notify(...)` resolves the same templates against **its own** ids and
re-renders every subscriber - excluding itself, since the dispatch path already re-renders it.
`ctx.notifyAll` includes itself.

Each events module also exports a **concrete** form (`queueEvents(id)`) for a publisher outside
the tree that has the id in hand and no ids map to resolve against. A test beside each pins that
the two forms name the same channel.

Publishers therefore never hold a reference to subscribers. A child mutates the database, publishes
a label, and the parent re-renders without either view knowing the other exists.

Labels are bare strings, and unreachable labels are inert. There is no context registry to keep in
sync - publishing to a label nobody subscribes to is a no-op.

## Consequences

- `resolveAncestry` runs a recursive CTE on every dispatch and every spawn. Deep chains cost real
  queries; keep ancestry shallow.
- Because ids resolve against the ancestry map, a template referencing a key not present throws at
  resolution time. The key is a **route**, never a domain noun: the ACL events are keyed on
  `${aclroles}`, the root panel whose `entityId` is the guild, because nothing in ancestry would
  ever supply a `${guild}`. A view publishing an event it has no ancestor for is a programming
  error and fails loudly - which is the desired behaviour.
- `updateState` is a read-modify-write with no transaction or row lock. Concurrent interactions on
  one view can lose a write. Closing this is required before views that hold sequence state can
  be trusted.
