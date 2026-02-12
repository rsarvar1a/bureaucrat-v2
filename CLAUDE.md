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

```
index.ts                         # Entrypoint (runs migrations, starts bot)
bureaucrat/                      # Bot source code
  utilities/db.ts                # Drizzle client + programmatic migration
  schema/**/*.sql.ts             # Drizzle schema definitions (convention)
migrations/                      # Generated SQL (committed to git)
docker/bureaucrat.Dockerfile     # Local dev Dockerfile
docker-compose.yml               # Local dev: bot + postgres:18
drizzle.config.ts                # Drizzle Kit config (generate only)
```

## Database

- **ORM**: Drizzle ORM with the `postgres-js` driver (`drizzle-orm/postgres-js`).
- **Migrations**: Schema files go in `bureaucrat/schema/**/*.sql.ts`.
  - `bun run db:generate` -- generate SQL migrations from schema changes (dev-time, commit the output)
  - Migrations run programmatically on startup via `drizzle-orm/postgres-js/migrator`
  - `drizzle-kit` is a devDependency used only for generation, not at runtime
- **Connection**: Uses `DATABASE_URL` env var. See `.env.example`.

## Local Development

Local dev runs in Docker via `docker-compose.yml`:

- `bureaucrat` service: builds from `docker/bureaucrat.Dockerfile`, mounts the repo at `/app`
- `postgres` service: postgres:18 with healthcheck, data persisted in a named volume
- `DATABASE_URL` is constructed by docker-compose from the `POSTGRES_*` vars in `.env`

Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` to get started.

## Production

Production does not use Docker. The bot runs directly with `bun run start` against an externally-managed Postgres. Only `DATABASE_URL` and `DISCORD_TOKEN` need to be set.

## Testing

Use `bun test` to run tests.

```ts
import { test, expect } from 'bun:test';

test('example', () => {
  expect(1).toBe(1);
});
```
