# ADR-006: Access archetypes

## Status

Accepted (2026-11-12). Replaces the free-form ACL: `AclRole`, `AclBinding`, `AclGrant`, the
`acl` schema and `/settings permissions`.

## Context

The ACL let a server define its own roles, bind them to members or Discord roles, optionally per
queue or game, and grant or deny each permission. It was more than any server configured, its
editor was hard to reason about, and it said nothing about who may _join_: anyone could enter a
queue as a Storyteller or sign up as a player. The bot was about to run in servers whose members
are not all trusted.

## Decision

Four fixed archetypes, each a list of Discord roles in `GuildSettings`, set in `/admin config`:

- **Manager**: every permission. The owner and anyone with Manage Server or Administrator always
  count, so no setting can lock a server out of its own bot.
- **Moderator**: `MODERATOR_PERMISSIONS` (`acl/permissions.ts`): run any game as its Storyteller,
  manage any queue entry, `/game new`, archive or copy an ended game. Never the server's
  configuration or the queues themselves.
- **Storyteller** and **Player** are gates rather than permissions: when roles are set, one is
  needed to enter a queue or sign up as a Storyteller, and to sign up as a Player or Kibitzer.
  A queue's Access tab can require one of its own roles **as well**, never instead. Managers
  pass both gates. They are checked on joining only: once in a game, the membership decides
  (ADR-005), so a role taken away mid-game does not strand a seat.

`Permissions` stays as the vocabulary at call sites; `acl/archetypes.ts` decides, import-free and
tested exhaustively, and `acl/resolve.ts` reads it over the cached roles.

## Consequences

- No per-member or per-location grants. A queue that needs its own maintainers gets them from
  Moderators server-wide.
- The migration carried server-wide Discord-role bindings of the seeded `admin` and `moderator`
  roles over to Managers and Moderators; member bindings, location bindings and other ACL roles
  were dropped.

## Addendum: recusal

A Moderator who is a Player in a game, or has a pending signup to play in it (or to a queue
entry), holds no archetype there: they cannot open its Storyteller views, run its Storyteller
commands, or manage that entry. Storytellers and Kibitzers keep theirs (`recuses` in
`impl/acl/archetypes.ts`). Managers are the server's admins and are never recused.

Discord's own permissions are taken away to match: while a Moderator plays, their member overwrite
on the game channel denies Manage Threads (which would show every private thread, and which every
thread inherits) and Pin Messages (`games/member-overwrite.ts`).
