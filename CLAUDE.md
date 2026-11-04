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
    acl/                         # Permission catalogue, resolver, cache, seed
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
no watch mode, Postgres unpublished, logs capped, and every variable the bot reads named there and
interpolated from the host's `.env` at `up` time (`.env` never enters the image). The checkout lives
at `/root/bureaucrat-v2`; `ctl/bureaucratctl` is the only way the stack is invoked (`up`/`down`
from the systemd unit it installs from `ctl/bureaucrat.service`, `deploy` for a release, which
waits for the bot's "Logged in as" line). A barebones `.env` is `ctl/env.example`: the token, the
client id and the Postgres credentials.

The offsite archive (`/game offsite`) copies an ended game into a second server the bot is also
in, named by `/archives offsite config`. There it needs View Channel, Manage Channels, Manage
Webhooks, Manage Threads, Send Messages (and in Threads), Create Public Threads, Attach Files,
Embed Links, Manage Messages and Read Message History on the archive category; the command checks
and says which are missing. The copy is a background job driven from `GameExport` rows
(`impl/discord/games/offsite/`), so a restart resumes it. `/archives offsite copy` copies the
channel it is run in, adopting one the record does not know (an older bot's game) as a bare ended
game first (`offsite/adopt.ts`). `/archives manage` can turn on copying every game as it ends
(`GuildSettings.offsiteAuto`, acted on at the end of `endGame`). `/archives offsite sync` queues
every channel across the server's archives that the archive server lacks and flags a reflow, which
the offsite engine performs once its queue drains (`GuildSettings.offsiteReflowPending`).

Archive categories, on-server and offsite, are chains (`impl/discord/games/archives/`): the
configured category is a seed (`Archives`); when it fills, it is renamed `Archives 1`, `Archives 2`
is created above it with the same overwrites and the setting moves along, and so on upward. The
chain reads top-down, newest first. `/archives reflow` and `/archives offsite reflow` put every
channel across a chain in date order (by the record's end date on-server, by the name's stamp
offsite), making categories as needed.

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
  `impl/discord/guards/command-access.ts`, which has a test that pins the rule.
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
  them and the entity's end event takes the stack down. Creation code calls `openWindow` on the
  root only (see `impl/README.md` and ADR-004). A window that attaches files must not render
  on a broad event like `Changed`, since a V2 edit re-sends every file; it re-renders from its
  own handlers only (see `gscript`). A tab that opens a header may
  `inline` its strip as a second row instead of a second message; the choice is per tab.
- **Membership**: game members are `Participant` rows and signups are pending requests, nothing
  more (ADR-005). Every thread join or leave goes through `games/membership.ts`, which does the
  Discord call and records the row together; never call `thread.members.add` directly. A game's
  tracked Discord roles (`games/roles.ts`, one per logical role) follow the Participant rows:
  grant on arrival, revoke on departure, delete at the end. They carry no guild permissions; the
  Kibitzers' role alone gets Manage Threads on the game channel, which is how Discord lets a role
  see every private thread (`grantKibitzerSight`). A player in an open synchronous whisper has a
  member overwrite on the game channel (no Send Messages, Send Messages in Threads allowed) that
  only `games/whispers/restrict.ts` writes or removes; `/whispers end`, promotion to async, night
  and the game's end all go through it.
- **Strings**: the framework's own words live in `strings/common.ts` and every refusal in
  `strings/errors.ts`. View and command text is still inline and migrates opportunistically.

## Testing

Use `bun test` to run tests. Tests live under `bureaucrat/tests/`, mirroring the source tree, and
must not reach a socket: keep decision modules (`acl/resolve.ts`, `guards/scope.ts`,
`guards/command-access.ts`) import-free or mocked so they can be tested exhaustively.

```ts
import { test, expect } from 'bun:test';

test('example', () => {
  expect(1).toBe(1);
});
```
