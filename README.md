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

## Migrations

Schema files live in `bureaucrat/schema/**/*.sql.ts`.

```sh
bun run db:generate            # diff schema against existing migrations, produce new SQL
bun run db:migrate             # apply pending migrations to the database
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and migration workflow.
