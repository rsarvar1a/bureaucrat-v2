# Bureaucrat v2

Discord bot for Clocktower. Bun + TypeScript + discord.js + Drizzle ORM + Postgres.

## Setup

Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`.

## Running with Docker (recommended)

```sh
docker compose up              # start bot + postgres
docker compose up --build      # rebuild the bot image (after dependency changes, etc.)
docker compose down            # stop everything
docker compose down -v         # _nuke_ everything
```

The bot runs with `--watch` and the source is volume-mounted, so code changes hot-reload automatically.

## Running without Docker

Requires a running Postgres instance on your machine (or elsewhere). Set `DATABASE_URL` in `.env` to point at it.

```sh
bun install
bun run db:migrate             # apply pending migrations
bun run dev                    # start the bot
```

## Migrations

Schema files live in `bureaucrat/schema/**/*.sql.ts`.

```sh
bun run db:generate            # diff schema against existing migrations, produce new SQL
bun run db:migrate             # apply pending migrations to the database
```

`db:generate` is a dev-time step -- run it after editing schema files, review the output in `migrations/`, and commit it. In Docker, both generate and migrate run automatically on every hot-reload.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and migration workflow.
