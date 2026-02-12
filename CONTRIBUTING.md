# Contributing

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow this format:

```
type(scope): description
```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `perf`, `style`

**Scope** is optional but encouraged -- it should be a short word identifying the area of the codebase (e.g. `db`, `docker`, `commands`).

Examples:

```
feat(commands): add /ping slash command
fix(db): handle nullable columns in player table
refactor(docker): simplify entrypoint script
docs: update README with migration instructions
chore: bump drizzle-orm to beta.16
```

This is enforced by a commit-msg hook via commitlint. If your message doesn't match, the commit will be rejected.

## Migrations

Schema changes trigger automatic migration generation via a pre-commit hook. Here's what happens and what you need to do:

1. You edit a schema file in `bureaucrat/schema/**/*.sql.ts`
2. On commit, the pre-commit hook runs `db:generate`
3. If your schema changed, Drizzle creates a new subfolder in `migrations/` (e.g. `0003_short_snowbird/`) with auto-generated SQL and metadata
4. The hook stages these files and the commit goes through

The auto-generated folder name for the migration is rather opaque; rename it to something meaningful.

```sh
# rename the new migration to something that describes what it does
mv migrations/0003_short_snowbird migrations/0003_add-player-table

# add a new fixup commit for the folder renaming operation
git add migrations/
git commit --fixup HEAD

# cleans up the history by rolling the fixup comnmit into the previous "real" commit
git rebase -i --autosquash main
```

This squashes the rename into the original commit so the migration folder has a clean name in the final history.
