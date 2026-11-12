# impl

This bot. Everything here is expected to change; nothing in `engine/` may depend
on it.

```
acl/        the permission catalogue, archetypes, resolver and cache
discord/
  access/     the actor read off an interaction, and the resolver wrapped for both halves
  commands/   *.cmd.ts, globbed by the registry
  games/      the game lifecycle: create, provision, claim, start, reopen, end, vacancy, phases, names;
              membership, members, signups, seats, substitute; script/ parses the script tool's JSON
              and rasterises PDF pages (mupdf, WebAssembly: no native dependency)
  guards/     ViewGuards (can, inGuild, queue and game locators) and the command path rule
  handlers/   top-level client event handlers
  registry/   where the frameworks meet the implementation
  views/      *.view.ts, globbed by the registry; helpers and events live beside them
```

## Why some of this is not framework

- **`guards/`** looks like framework and is not: it reads queues and entries, so
  it knows the domain. Generic view plumbing lives in `engine/discord/views`.
- **`acl/`** is policy about who may do what in _this_ bot, not infrastructure.
  `archetypes.ts` is pure over a guild's archetype roles and is tested
  exhaustively; `resolve.ts` bridges it to the cache (ADR-006).
- **`registry/{commands,views,handlers}.ts`** are where the frameworks meet the
  implementation. They live in a folder of their own because
  `impl/discord/commands.ts` beside `impl/discord/commands/` makes `'..'`
  ambiguous - TypeScript resolves the directory, not the file.

## Guard conventions

- `'*'` carries only `inGuild`. Permission guards go on the acting keys, so a
  `dismiss` always works for whoever is looking at the pane.
- Guard both halves of a confirm: `delete` and `delete-confirm` are separate
  actions.
- A locator (`queueFromEntity`, `queueOfEntry`) returns the record's guild so
  `can` can refuse a custom id replayed from another server.
- Slash commands are gated centrally by `commandAccess(path)`; a new command under
  `admin` or `settings` arrives gated without anybody remembering.
- A command anyone uses inside a game (`/signups signup`, `/game script`) is open at the gate and
  decides in the handler, by channel and participation. `storytells` would refuse
  the very people it is for.

## Tabbed panes

A management pane that would otherwise branch into child panes is one ephemeral
view with a `tab` field in its state, built on the `tabs` component. `queuemanage`
(Description | Resources | Category | Access | Delete), `qmanage` (Details | Signups)
and `statsmessages` (Games | Users) are the three in the tree.

- The strip is the header, with a separator beneath it so the content does not
  crowd the buttons. Every tab reads top to bottom as navigation (the strip),
  content, actions, then the pane's own controls: Dismiss has the last row to
  itself, behind a separator, and never shares a row with an action.
- The strip holds at most five tabs, and each tab stays inside Discord's five
  action rows counting the strip and the Dismiss row. The Signups tab with a
  signup picked is at that ceiling.
- Tab switches are navigation and sit under `'*'` only; permission guards go on
  the acting keys inside each tab, so a replayed custom id is refused whichever
  tab is up.
- A pane that can delete its entity puts Delete on the strip as a Danger tab,
  the only coloured one, and the confirm row lives inside that tab. It never
  shares an action row with Edit.
- Renderers live in a sibling folder (`queue/settings/`, `queue/manage/`), one file per tab, returning body elements and control rows.
  Handlers stay in the view. A tab of steppers declares its specs beside the
  renderer, and the view keys a guarded handler off every press.
- A `tabs.ts` beside them exports the strip and the action list, which a test
  under `tests/impl/discord/` checks for strip size and custom-id length.
- Pane state is interface state only (the tab, the selected row, a filter).
  Domain reads happen in `render`, so a pane re-renders rather than going stale
  when it subscribes to the entity's events.

## Emotes

Role and state emotes are looked up by normalised name (`games/emotes.ts`): the game's server
first, then Bureaucrat's Office, then the application's own emoji, then every other server. The
application set (2000 slots) is filled by `/admin emoji` (`games/emoji-sync.ts`): every official
character icon from the release repository, aligned variants included, and the Office's marks;
reruns add only what is missing. It is fetched once at ready, since it never arrives over the
gateway.

## Naming people

Discord adds a mentioned user to a private thread. The GAME CONFIG stack and every ST thread are
private, so a `<@id>` in a window would quietly pull the player it names into the Storytellers'
thread. `views/naming.ts` decides per channel: `namer(client, guild, view.channel, members)`
returns `<@id>` where the message lands in a public thread or channel and the bold display name
(with the username when it differs) in a private thread. Game windows and their toasts name people
through it; the queue views live in public channels and mention directly.

## Windows

A tree menu that has to stay on screen is a **stack** of public messages in one
thread: a header built on the `stack` component, the window its active tab
names beneath it, and another window beneath that when the window is itself a
header. GAME CONFIG is the one in the tree (`views/games/STRUCTURE.md`).

- A window has no Dismiss. Its header closes it when a tab changes
  (`replaceChildWindow`), and a detach subscription on the entity's end event
  disconnects the whole stack, leaving its messages in place without controls.
- A header is never closed by its children, and nothing but the bot posts in
  the thread, so a replaced window lands where the old one was.
- `openWindow` opens a header and then whatever its registered stack wants
  beneath it, so creation code opens the root and nothing else.
- Rows cascade on delete, messages do not: `closeWindow` deletes messages
  deepest first before the row goes.
- A window can be a header too (`gsetup`, `gsignups`): its strip replaces the
  window beneath it the same way, and `openWindow` recurses through both.
- A root tab that opens a header may `inline` it instead: the child's strip is a
  second row of the root behind a separator, under a subtitle naming the root tab,
  and the leaf opens directly beneath.
  Neither is inlined today: the root keeps the navigation and the game-state
  action, the nested header its own strip, and the content sits beneath both.
  Add `inline` to the tab in `views/games/tabs.ts` to fold a header into the
  root. The strip is declared once (`SETUP_STRIP`) and serves both shapes.
- A card family outside the stack (the town square, the whisper cards, the
  nomination cards, the offsite progress card) is parentless: its spawn `ids` serve the subscriptions
  only, so it publishes with its concrete builder (`gameEvents(id)`,
  `nominationChanged(id)`), never a template.
- A window that attaches files (`gscript`) does not render on `Changed`: a V2
  edit re-sends every file, so it re-renders only from its own handlers, which
  are the only writers of what it shows. `/game script` serves the same bytes per call,
  as an ephemeral card with a Preview of its own.
- Thread membership goes through `games/membership.ts`, which does the Discord
  call and writes the `ManagedThreadParticipant` row together (ADR-005).
- A player's silence in town while they whisper is a member overwrite on the
  game channel, written and removed only by `games/whispers/restrict.ts`; the
  bot needs Manage Roles on the channel for it, as it does for Kibitzer sight.
- `/game end` is the only teardown; `games/end.ts` publishes the concrete
  `Ended` label since it has no window context of its own.
