# Bureaucrat v2

Discord bot built with Bun, TypeScript, discord.js, Drizzle ORM, and Postgres.

## Runtime

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`

## Project Structure

The tree is layer-first. `engine/` is reusable machinery, `impl/` is this bot, and
`schema`/`drizzle`/`utilities`/`strings` sit beneath both. The arrows only point downwards, and
ESLint enforces it (`eslint.config.ts`).

```
index.ts                         # Entrypoint (initialize, then log in)
docker/entrypoint.ts             # Applies migrations, watches .env, then imports index.ts
bureaucrat/
  app.ts                         # Named startup hooks
  engine/discord/                # Views, commands, components, elements, reply (see engine/README.md)
  impl/                          # This bot (see impl/README.md)
    acl/                         # Permission catalogue, archetypes, resolver, cache
    discord/{access,guards}/     # Actor extraction; ViewGuards and the command path rule
    discord/{commands,views}/    # *.cmd.ts and *.view.ts, globbed by registry/
    discord/handlers/            # Top-level client event handlers
    discord/registry/            # Where the frameworks meet the implementation
  schema/**/*.sql.ts             # Drizzle schema definitions (convention)
  drizzle/                       # Parameterized query/mutation helpers
  strings/                       # Every word the bot says, under `S.<area>` (imports nothing)
  utilities/                     # db, logger, env typings
  tests/                         # Mirrors the source tree
migrations/                      # Generated SQL (committed to git)
docs/interactions/               # ADRs for the view framework
queries/                         # Hand-run SQL for watching prod (offsite throughput, errors)
```

## Database

- **ORM**: Drizzle ORM with the `postgres-js` driver (`drizzle-orm/postgres-js`).
- **Migrations**: Schema files go in `bureaucrat/schema/**/*.sql.ts`.
  - `bun run db:generate` -- generate SQL migrations from schema changes (dev-time, commit the
    output; the pre-commit hook runs it when a schema file is staged). Rename the generated folder
    per CONTRIBUTING.md.
  - `bun run db:migrate` -- apply pending migrations. `docker/entrypoint.ts` does this on startup
    and deliberately does **not** generate: drizzle-kit prompts without a TTY and would hang.
  - `drizzle-kit` is a devDependency used for generation and migration, not by the bot itself.
- **Connection**: Uses `DATABASE_URL` env var. See `.env.example`.
- **Blobs**: the script's JSON and PDF are `jsonb` and `bytea` columns in `core`. Read the bytes
  only from a command that serves them (`/game script`); a summary query leaves them out.

## Local Development

Local dev runs in Docker via `docker-compose.yml`:

- `bureaucrat` service: builds from `docker/bureaucrat.Dockerfile`, mounts the repo at `/app`
- `postgres` service: postgres:18 with healthcheck, data persisted in a named volume
- `DATABASE_URL` is constructed by docker-compose from the `POSTGRES_*` vars in `.env`

Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` to get started.

The container hot-reloads on source changes and restarts itself when `.env` changes. Because it
runs as root, anything it writes into the bind mount (a generated migration, say) is root-owned on
the host; generate migrations from the host instead.

## Production

Production is the same compose stack with `docker-compose.prod.yml` laid over it: no source mount,
no watch mode, Postgres published on the host's loopback only (an SSH tunnel reaches it), logs capped, and every variable the bot reads named there and
interpolated from the host's `.env` at `up` time (`.env` never enters the image). The checkout lives
at `/root/bureaucrat-v2`; `ctl/bureaucratctl` is the only way the stack is invoked (`up`/`down`
from the systemd unit it installs from `ctl/bureaucrat.service`, `deploy` for a release, which
waits for the bot's "Logged in as" line). A barebones `.env` is `ctl/env.example`: the token, the
client id and the Postgres credentials.

The offsite archive (`/game offsite`) copies an ended game into another server the bot is also in.
`/archives offsite manage` maps each on-server archive family (a category chain: `Archives 1…N`, a
Hall of Fame, a queue's archive) to a destination category there (`OffsiteSource` →
`OffsiteDestination`, `impl/discord/games/offsite/mappings.ts`); a game goes to the destination of
the family its channel sits in, or else of the archive it is to be filed in, and an unmapped one is
not copied. Families pointed at the same chain share one destination. There the bot needs View
Channel, Manage Channels, Manage Webhooks, Manage Threads, Send Messages (and in Threads), Create
Public Threads, Attach Files, Embed Links, Manage Messages and Read Message History on the
category; the pane checks and says which are missing. The copy is a background job driven from
`GameExport` rows, one per game and destination (null for the read-only `/game export`), so a
restart resumes it and a game promoted into a second mapped family gets a second copy; that
export clones the first one's read in the database rather than reading Discord again.
Reading and copying have separate slots (`offsite/schedule.ts`): `OFFSITE_READERS` (default 4),
since reading spends the bot's own request budget, and `OFFSITE_WRITERS` (else the older
`OFFSITE_CONCURRENCY`, else 4), since each copy writes through its own webhook. Never two jobs of one
game run at once. Discord lets a server gain only so many threads at a time (about twenty in five
minutes); a copy that meets the limit fills and closes the threads it has, then is deferred
(`offsite/gate.ts`, `GameExport.notBefore`) and gives its slot back, so waiting writers never starve
the rest. The rejection is scoped to that one call (`rest/reject.ts`): everything else still waits a
limit out. The database pool (`DATABASE_POOL_SIZE`, else sized from both in `utilities/pool.ts`)
follows them. `/archives offsite copy` copies the channel it is run
in, adopting one the record does not know (an older bot's game) as a bare ended game first
(`offsite/adopt.ts`). `/archives manage` can turn on copying every game as it ends
(`GuildSettings.offsiteAuto`, acted on at the end of `endGame`) and whether private threads go into
the copy (`offsitePrivate`, off by default: the reader always reads them, the writer leaves them
unmarked, and turning the setting on or a later sync sends finished copies back for just those).
Copied threads open among the channel's messages where they began, and are archived at the end.
`/archives offsite sync` queues every channel across the mapped archives that its destination
lacks and flags each destination for a reflow, which the offsite engine performs once its queue
drains (`OffsiteDestination.reflowPending`).

Archive categories, on-server and offsite, are chains (`impl/discord/games/archives/`): the
configured category is a seed (`Archives`); when it fills, it is renamed `Archives 1`, `Archives 2`
is created above it with the same overwrites and the setting moves along, and so on upward. The
chain reads top-down, newest first. Placing a channel in a chain (`placeInChain`) and reflowing one
hold that chain's in-process lock and read it fresh, so concurrent copies cannot both take the last
slot or both make the next link; a category Discord still calls full is skipped and room found again. `/archives reflow` and `/archives offsite reflow` put every
channel across a chain in date order (by the record's end date on-server, by the name's stamp
offsite), making categories as needed.

`/stats` reads results live (`listPlayerResults`) and message counts from the rollups in
`schema/core/stats.sql.ts`, per game from its largest export. Scanning `ExportMessage` is too slow for a
view, so `games/stats/refresh.ts` recounts a game whose largest export has changed, on each
`/stats messages` render, and the first one in a server can take seconds. `queries/playerstats/`
keeps the same 2-day stretch of play by hand. `GuildSettings.statsNormalization` is the threshold
a win rate over fewer games is padded up to, half of the missing games won and half lost.

## Implementation Guidelines

- **Layering**: `engine/` never imports `impl/`; the bottom tier never imports either. A loader
  takes its root as an argument rather than guessing it, because a runtime-assembled path is an
  edge the linter cannot see.
- **Reusable queries/mutations**: Extract shared database operations into `bureaucrat/drizzle/` as
  parameterized helper functions. Views should not contain inline query logic that could be
  reused elsewhere.
- **Complex view structure**: When a view grows beyond a single file, promote it to a folder:
  `views/<name>/<name>.view.ts`, with subinteractions, helpers, renderers, etc. as sibling files.
  Only `*.view.ts` files are loaded. Avoid monolithic view files.
- **Authorization**: Views declare `guards` per action; `'*'` carries only `inGuild` and
  permission checks go on the acting keys so `dismiss` always works. Guard both halves of a
  confirm. Commands are gated centrally by `commandAccess(path)` in
  `impl/discord/guards/command-access.ts`, which has a test that pins the rule. Who holds a
  permission is decided by four archetypes bound to Discord roles in `/admin config`
  (`impl/acl/archetypes.ts`, ADR-006): Managers (and Manage Server holders) everything, Moderators
  `MODERATOR_PERMISSIONS`; Storyteller and Player are gates checked on joining (`mayJoinAs`), which
  a queue's Access tab can tighten.
- **Events**: each view family's `events.ts` exports templates (for `subscribesTo` and in-tree
  publishers) and a concrete builder (for publishers outside the tree), with a test asserting they
  agree. Template keys are routes, never domain nouns.
- **Small abstractions**: Extract single-responsibility helpers for common application-level and
  Discord-related patterns (see `engine/discord/reply.ts` as a reference). Reduce cognitive
  complexity in event handlers and interaction callbacks by composing these small utilities.
- **Reusable view components**: When a UI pattern appears in more than one view (or is likely
  to), extract it into `bureaucrat/engine/discord/components/` as a composable component.
  Components return `button`/`row` builders, `interactions` to spread into the view, and any
  helper methods needed for rendering. Higher-level components should compose lower-level ones
  (e.g., `dismissButton` with `confirm: true` composes `confirmButton` internally). Prefer
  composition over monolithic components with many options.
- **Tabbed panes**: a management pane that would branch into child panes is one ephemeral view
  with a `tab` state field built on the `tabs` component, renderers in a sibling folder, tab
  switches ungated and permission guards on the acting keys (see `impl/README.md`). Keep the strip
  at five tabs and each tab inside five action rows.
- **Windows**: a persistent tree menu is a stack of public messages in one thread, built on the
  `stack` component and `engine/discord/views/windows.ts`: a header, the window its tab names
  beneath it, deeper if that window is a header too. Windows have no Dismiss; the header closes
  them and the entity's end event detaches the stack (messages stay, controls stripped, as does every
  game view on `Ended`). Creation code calls `openWindow` on the
  root only (see `impl/README.md` and ADR-004). A window that attaches files must not render
  on a broad event like `Changed`, since a V2 edit re-sends every file; it re-renders from its
  own handlers only (see `gscript`). A tab that opens a header may
  `inline` its strip as a second row instead of a second message; the choice is per tab.
- **Membership**: game members are `Participant` rows and signups are pending requests, nothing
  more (ADR-005). Every thread join or leave goes through `games/membership.ts`, which does the
  Discord call and records the row together; never call `thread.members.add` directly. A game's
  tracked Discord roles (`games/roles.ts`, one per logical role) follow the Participant rows:
  grant on arrival, revoke on departure, delete at the end. They carry no guild permissions, only
  overwrites on the game channel (`grantChannelOverwrites`): the Kibitzers get Manage Threads,
  which is how Discord lets a role see every private thread, and the Storytellers get Manage
  Threads and Pin Messages. Startup re-applies them to every running game. A player in an open synchronous whisper has a
  member overwrite on the game channel (no Send Messages, Send Messages in Threads allowed) that
  only `games/whispers/restrict.ts` writes or removes; `/whispers end`, promotion to async, night
  and the game's end all go through it.
- **Errors**: a caught error that is not simply handled is recorded in `ErrorEvent` through
  `impl/discord/errors/record.ts`: `fault(operation, outcome, error)` in a `catch`, or
  `.catch(swallow(operation, outcome, fallback))` where a silent `.catch(() => null)` would have gone.
  `outcome` is what it cost (`failed`; `degraded`: something missing from the result; `ignored`: a
  fallback covered it; `aborted`: the job stopped there instead). A transient error (the network, a
  rate limit, a 5xx, the database out of reach: `isTransient` in `errors/classify.ts`) is never a
  reason to leave something out: `swallow` with a losing fallback, and `abortIfTransient` at the top of
  an explicit catch, throw it on so the job stops with nothing skipped and a retry carries on. A
  background job runs inside `faultScope({ area, game, export })` so every fault beneath it is filed
  under that. The classifier normalises routes, scrubs webhook tokens and unwraps query wrappers
  (whose messages quote parameters). The offsite engine is instrumented so far; `queries/errors-*.sql`
  read it back.
- **Strings**: the framework's own words live in `strings/common.ts` and every refusal in
  `strings/errors.ts`. View and command text is still inline and migrates opportunistically.

## Testing

Use `bun test` to run tests. Tests live under `bureaucrat/tests/`, mirroring the source tree, and
must not reach a socket: keep decision modules (`acl/archetypes.ts`, `guards/scope.ts`,
`guards/command-access.ts`) import-free or mocked so they can be tested exhaustively.

```ts
import { test, expect } from 'bun:test';

test('example', () => {
  expect(1).toBe(1);
});
```
