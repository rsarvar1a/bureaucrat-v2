# ADR-005: Game Membership

**Status**: Accepted
**Date**: 2026-11-01

## Problem

A game has people in several relationships to it at once: those running it, those playing, those
watching, those who have asked to do one of these, and those who used to play and were replaced.
Each of those relationships carries Discord state (thread memberships) that the bot must be able
to add, remove, hand over, and rebuild. The first cut mixed them: a Signup row had an `accepted`
flag, so "who is in the game" was a query over two tables with a filter, and the threads a member
had been added to were nowhere recorded at all.

## Decision

**Membership is a `Participant` row.** A Player, Storyteller or Kibitzer of a game is a
Participant with that role, and nothing else makes someone a member. Seating refers to a
Participant; a seat is a Player's place in the circle, not a membership of its own.

**A `Signup` is a pending request and nothing more.** It names a member, the role they asked
for, and what they said. Accepting it inserts the Participant and deletes the Signup; declining
deletes the Signup. There is no accepted Signup, and nothing is "consumed": the circle is seated
from the set of Player participants whenever a Storyteller asks.

**Thread membership is recorded.** `ManagedThreadParticipant` holds which Participant is in which
managed thread. Every join and leave goes through `games/membership.ts`, which does the Discord
call and writes the row together, collecting failures instead of throwing, so the rows reflect
intent and a retry (Start again, Add again) converges on it.

**Substitution repoints the seat first.** `Seating(game, player)` is a composite foreign key onto
Participant with `ON DELETE CASCADE`, so the order in `games/substitute.ts` is fixed: the seat
takes the newcomer, the newcomer joins the threads the outgoing player was in, the outgoing
player leaves them, and only then is the outgoing Participant deleted.

**Bytes are re-sent on every render.** The script's JSON and PDF live in Postgres (`jsonb`,
`bytea`) and are built fresh wherever they are attached: by `/game script` per call, and by the
Script window per render. A Components V2 message re-sends its files on every edit, so a window
that attaches them must not re-render on a broad event; the Script window subscribes to nothing
but `Ended` and re-renders only from its own handlers, which are the row's only writers.

## Consequences

- `/game signup` and `/game script` are open at the command gate and decide in the handler, by channel and
  participation. `storytells` would wrongly refuse players.
- Removing a Player from Seating keeps the Participant: they leave their threads and their seat,
  and Add offers them back. Removing them from Members is what takes them out of the game.
- The last Storyteller cannot be removed; a game with no Storyteller has nobody who can reach its
  windows.
- A member has one Participant per game, so a user select that adds someone already present is
  refused with their current role rather than creating a second row.
- Counting members is a count over Participant; counting the queue is a count over Signup. Neither
  needs a filter on the other.
