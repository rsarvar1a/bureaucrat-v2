# ADR-002: View Architecture and Lifecycle

**Status**: Accepted
**Date**: 2026-10-31

> Provenance: originated as this repository's ADR-003. This record describes the framework **as
> shipped** in `bureaucrat/engine/discord/views/` - the palette/`createPalette` concept and the
> `open-palette` handler result proposed there were never built, and ephemeral child views serve
> that role instead. The guards section describes what `keeper` added and what was ported back.

## Problem

A view must own its rendering, the handlers for its components, the ability to spawn children, and
the ability to re-render after something changes its underlying state. The question is how view
code is organised and how the router connects an incoming interaction back to a handler.

## Options

### Option A - File-based routing only

Each `*.view.ts` exports a plain object; the loader globs and registers handlers.

**Pros**: consistent with the existing `*.cmd.ts` pattern; keys derive automatically.
**Cons**: nothing enforces the shape of the exported object at definition time, so a dangling
action key in `render` fails at runtime rather than at compile time.

### Option B - Classes with decorator registration

**Pros**: handlers colocate with the view as methods; decorators make registration declarative.
**Cons**: decorator metadata adds build complexity, and inheritance invites deep hierarchies for
what is fundamentally a data structure.

### Option C - `createView` factory (chosen)

A curried factory validating the definition and inferring the action union from `interactions`.

**Pros**: mirrors the `Superbuilder` pattern already used for commands; keeps concerns
co-located; catches dangling routes at compile time.
**Cons**: the currying (`createView<S, E>()({...})`) is unusual on first encounter.

## Decision

**Option C.** Views are declared with `createView<State, typeof Events>()({ ... })` and auto-loaded
by globbing `**/*.view.ts` under the root that `impl/discord/registry/views.ts` supplies. Each view
registers its handlers under `view::<viewId>::<actionKey>`.

### Handler results

Handlers return a `HandlerResult`, which the framework acts on after the handler completes:

```typescript
type HandlerResult = { action: 'render' } | { action: 'destroy' } | { action: 'noop' } | void;
```

- **`render`** - re-render this view. On the dispatch path this defers and edits through the
  interaction; on the notify path it edits the channel message or the ephemeral webhook.
- **`destroy`** - run the view's `destroy` hook, then delete the row. Subscriptions cascade.
- **`noop`** / `void` - the handler has already responded.

Note that `destroy` **precedes** `render` in `lifecycleHandlers`, so a view subscribed to both
actions for the same event is destroyed rather than re-rendered.

### Rendering is a pure function of persisted state

`render(view, db, client)` receives the persisted row, a database handle and the client, and
returns a message payload. It must not depend on in-process state and must not mutate. This is
what makes views survive a restart: nothing is held in memory between interactions.

### Guards

Authorization is declared per action and run by `dispatch` before the handler:

```typescript
guards: { '*': [inGuild], manage: [can(Permissions.Queue.Edit, queueFromEntity)] }
```

A `ViewGuard` returns `true` or a denial string, which the framework sends as an ephemeral reply.
Guards run after the view context exists, so they can read state, ancestry ids and the database.
A throwing guard is a refusal, never an admission. Put permission checks on the acting keys rather
than on `'*'`: a gated `dismiss` strands the pane on screen for anyone the guard turns away, and
both halves of a confirm (`delete` and `delete-confirm`) are separate actions that each need the
guard.

Activity is recorded after the guards pass, so a refused press does not keep somebody else's
ephemeral pane alive.

### Directory convention

```
bureaucrat/impl/discord/views/
  queue/
    queue.view.ts             # the parent panel
    queue-manage.view.ts      # an ephemeral child
    events.ts                 # context label templates and concrete builders
bureaucrat/engine/discord/components/   # reusable, not auto-loaded as views
```

Only `*.view.ts` files are loaded, so helpers, event templates, and renderers live beside their
view without being mistaken for one.

## Consequences

- View ids must be globally unique; the loader throws on a duplicate.
- Because `render` may be called with no interaction (the notify path), it cannot rely on having
  one. Anything interaction-specific belongs in a handler, not in `render`.
- `dismissButton` destroys the view row **without** invoking the view's `destroy` hook. If teardown
  must do more than delete a message, do it explicitly.
- Slash commands have no guard slot. They are gated centrally in `onChatInputCommand` by
  `commandAccess(path)`, a path-prefix rule pinned by a test.
