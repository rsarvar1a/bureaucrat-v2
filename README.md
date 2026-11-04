# Bureaucrat v2

Discord bot for Clocktower. Bun + TypeScript + discord.js + Drizzle ORM + Postgres.

## Setup

Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`.

Invite the bot with the Message Content intent. The bot requires the **Manage Roles** permission globally, and the **Manage Channels**, **Create Private Threads**, **Manage Threads** and **Send Messages in Threads** permissions in its categories.

## Running with Docker (recommended)

```sh
docker compose up              # start bot + postgres
docker compose up --build      # rebuild the bot image (after dependency changes, etc.)
docker compose down            # stop everything
docker compose down -v         # _nuke_ everything
```

## Running without Docker

Requires a running Postgres instance on your machine (or elsewhere). Set `DATABASE_URL` in `.env`!

```sh
bun install
bun run start                  # apply pending migrations, then start the bot
bun run dev                    # start the bot without migrating
```

## Deployment

Production runs the same two services, with an overlay, from a checkout at `/root/bureaucrat-v2`:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The overlay drops the source bind-mount and watch mode (a deployed container runs what was built,
not whatever is on disk at that instant), stops publishing Postgres to the host, and caps container
logs. It also names every environment variable explicitly, because production has no mount and
keeps `.env` out of the image, so a configuration change is an edit to the host's `.env` followed by
`up`, which re-reads it.

`ctl/` is the control surface so nobody has to remember the `-f` pair:

```sh
cp ctl/env.example .env        # token, client id, and the Postgres credentials; nothing else is needed
ctl/bureaucratctl install      # writes and enables /etc/systemd/system/bureaucrat.service
ctl/bureaucratctl deploy       # pull, build, start, and wait for "Logged in as"
```

systemd calls `bureaucratctl up` and `down` at boot and shutdown; a human calls `deploy`, `status`
(which says whether the bot is crash-looping), `logs`, `env` (which keys `.env` sets, never their
values) and `psql` (a shell inside the database container). Migrations are applied by the bot itself
on every start.

## Migrations

Schema files live in `bureaucrat/schema/**/*.sql.ts`.

```sh
bun run db:generate            # diff schema against existing migrations, produce new SQL
bun run db:migrate             # apply pending migrations to the database
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and migration workflow.
