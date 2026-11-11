# ADR-004: Stacked Windows for Persistent Tree Menus

**Status**: Accepted
**Date**: 2026-11-01

## Problem

A game needs a control surface its Storytellers keep coming back to for weeks: messaging, phases,
threads, and a great deal more to come. Ephemeral panes (ADR-003) are the wrong tool: they belong
to one member, expire, and would have to be reopened from a button somewhere every time. One
persistent message cannot hold it either. Discord caps a message at five action rows, and the
tabbed pane convention already spends one on the strip.

## Decision

The surface is a **stack of public messages** in a private thread (GAME CONFIG), one per level of
the menu tree:

- **Window A** is the navigation header: the entity's name and the line every tab needs, then a
  tab strip and nothing else.
- **Window B** is whatever A's active tab names. It holds that tab's content and actions.
- If B is itself a header, **window C** sits beneath it, and so on.

The engine adds two things for this.

`engine/discord/views/windows.ts` knows how to open and close windows. `openWindow` spawns a route
and, if that route registered itself as a header, recurses into the window its active tab wants,
so creation code opens the root and the stack unfolds to its leaves. `closeWindow` takes a window
and everything beneath it off the channel, deepest first, before its row goes. `replaceChildWindow`
closes a header's children and opens a new one in the header's own channel.

`engine/discord/components/stack.ts` is `tabs` whose press changes the next message down instead
of this one: it updates the header's state, replaces the child window, and re-renders the header.
Defining a stack registers its route so `openWindow` can recurse.

Windows are plain views. They inherit the entity from the header through ancestry (ADR-003), they
subscribe to the entity's `Changed` event to re-render and its `Ended` event to detach, and they
are guarded like anything else. They have no Dismiss, because the header above them is what
closes them.

## Inlined strips

A header whose tab opens another header costs a message per level, and a tree three deep is
three messages before any content. A stack tab may therefore carry `inline`: the child header's
strip (declared once as a `Strip`, without route or field, so the child header view can be
built from the same object) is drawn as a second row of the parent's message behind a separator
and a subtitle naming the parent tab, and the window beneath the parent is whichever leaf that
strip has active. The nested selection
lives in the parent's state under `<field>:<tab>`; its presses are `tab-<tab>-<leaf>`.

The choice is per tab and nothing else changes: the child header view stays in the tree, unused
while inlined, and removing `inline` opens it as a message again. An inlined header's own body
(its summary line) is not shown; only its strip is.

## Why messages, not one message

Each level gets its own five rows, which is the budget the deepest window needs on its own. The
header stays small and stable at the top. And a window is a real view with its own state, guards
and handlers rather than a case in a switch, so a nested menu is a nested view and nothing more.

## Consequences

- **Order depends on posting order.** A replaced window posts at the bottom of the thread, which is
  where the old one was only if nothing else has posted there. GAME CONFIG is private to the
  Storytellers and the bot, and the convention is that nobody chats in it.
- **Close first, open second.** A channel send deletes nothing, so a failed open after a close
  leaves a bare header (one press recovers it), while the other order would leave two windows.
- **Rows cascade, messages do not.** `View.parent` cascades on delete; `closeWindow` deletes the
  messages of every descendant before the parent row goes, which is why descendants are listed
  deepest first.
- **One spawn needs one interaction.** `spawnView` posts through an interaction's client even for a
  channel send, so a stack can only be opened from an interaction: a command, a button, a modal.
  A scheduled job that wants to open one has nothing to hand it.
- **Registration is at module load.** The loader imports every view before anything spawns, so a
  header is registered before `openWindow` could ask for it.
