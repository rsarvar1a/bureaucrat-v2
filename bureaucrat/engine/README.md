# engine

Reusable machinery. Knows nothing about this bot or this server.

```
discord/
  views/        the view framework: lifecycle, dispatch, guards, ancestry, subscriptions
                query.ts lists rows and descendants; windows.ts opens and closes stacked windows
  commands/     the slash command builder, loader and sync
  components/   confirm, dismiss, modal, pager, stars, stepper, tabs, stack
  elements/     Components V2 builders and accent colours
  reply.ts      replySafely, toast
```

## The rule

**`engine/` must never import `impl/`.** ESLint enforces it - but only for static
imports, since `no-restricted-imports` matches specifier strings. A path assembled
at runtime would slip past, which is why the two loaders take their root as an
argument rather than computing one:

```ts
loadViews(root); // impl/discord/registry/views.ts supplies it
loadDefinitions(root); // impl/discord/registry/commands.ts supplies it
```

The engine imports `strings/common` for the handful of words it says itself
(confirm, cancel, dismiss, the failure messages), so a bot's voice has no seam
at the framework boundary.

## Below the engine

`schema/`, `drizzle/`, `utilities/` and `strings/` sit underneath and may be used
freely. None of them may import the engine or the implementation.
