-- Re-read the channels the 2026-11-05 DNS outage skipped.
--
-- Before the transient-error fix, a channel whose read failed on a passing
-- error (EAI_AGAIN for discord.com or postgres, a Postgres connect timeout)
-- was marked read and named in `GameExport.unread`, and its copy went on
-- without it. This finds those channels from their `read.channel` error
-- events, marks them unread again, takes their names out of `unread`, and
-- sends their exports back through reading: the reader reads only what is
-- missing, then the writer copies only what is not yet copied (each a thread
-- opened after the channel's copy, without its "started a thread" line).
--
-- Run it after the transient-error fix is deployed, or the same outage
-- would skip them again.
--
--   bun prodsql < queries/mitigations/20261105_reread-transient-skips.sql
--       a dry run: shows what it would do, changes nothing
--   bun prodsql -v apply=1 < queries/mitigations/20261105_reread-transient-skips.sql
--       applies it to exports at rest (copied, failed)
--   bun prodsql -v apply=1 -v include_busy=1 < …
--       also exports the engine may be running (reading, copying): only with
--       the bot stopped, or a running copy marks itself copied over this
--   bun prodsql -v apply=1 -v game='rerack of al time' < …
--       only the games matching this pattern (ILIKE); the dry run takes it too
--
-- Safe to run again. A channel counts as skipped while it is still named in
-- `unread`, or once reset while its export ended up copied or failed anyway;
-- one read for real since matches neither, so the busy ones can be picked up
-- by a second run once they settle.

\if :{?game}
\else
\set game '%'
\endif

BEGIN;

CREATE TEMP TABLE skipped ON COMMIT DROP AS
SELECT DISTINCT c.id AS channel_row, c.export, c.channel, c.name, c.kind, e.state, g.name AS game
FROM core."ErrorEvent" ev
JOIN core."ExportChannel" c ON c.export = ev.export AND c.channel = ev.channel
JOIN core."GameExport" e ON e.id = c.export
JOIN core."Game" g ON g.id = e.game
WHERE ev.area = 'offsite'
  AND ev.operation = 'read.channel'
  AND ev.outcome = 'degraded'
  AND g.name ILIKE :'game'
  -- Passing failures only: the network, or the database wrapped as `other` before the classifier unwrapped it.
  AND (ev.kind = 'network' OR ev.detail ->> 'cause' ~ '(EAI_AGAIN|CONNECT_TIMEOUT|ECONNRESET|ETIMEDOUT)')
  AND (
    (c."readDone" AND e.unread ? c.name)
    OR (NOT c."readDone" AND e.state IN ('copied', 'failed'))
  );

\if :{?include_busy}
CREATE TEMP TABLE targets ON COMMIT DROP AS SELECT * FROM skipped;
\else
CREATE TEMP TABLE targets ON COMMIT DROP AS SELECT * FROM skipped WHERE state IN ('copied', 'failed');
\endif

\echo
\echo 'Skipped channels, and what this run does with each:'
SELECT s.game, s.state, s.kind, s.name AS channel,
       (SELECT count(*) FROM core."ExportMessage" m WHERE m.export = s.export AND m.channel = s.channel) AS messages_so_far,
       CASE WHEN t.channel_row IS NULL THEN 'busy: left for a later run' ELSE 're-read' END AS action
FROM skipped s
LEFT JOIN targets t USING (channel_row)
ORDER BY action DESC, s.game, s.name;

UPDATE core."ExportChannel" c
SET "readDone" = false, "updatedAt" = now() AT TIME ZONE 'UTC'
FROM targets t
WHERE c.id = t.channel_row;

UPDATE core."GameExport" e
SET unread = coalesce(
      (SELECT jsonb_agg(u)
       FROM jsonb_array_elements_text(e.unread) u
       WHERE u NOT IN (SELECT name FROM targets t WHERE t.export = e.id)),
      '[]'::jsonb),
    state = 'reading',
    error = NULL,
    "notBefore" = NULL,
    "updatedAt" = now() AT TIME ZONE 'UTC'
WHERE e.id IN (SELECT export FROM targets);

\echo
\echo 'Exports sent back through reading:'
SELECT g.name AS game, e.copy, e.unread AS still_unread,
       (SELECT count(*) FROM targets t WHERE t.export = e.id) AS channels_to_reread
FROM core."GameExport" e
JOIN core."Game" g ON g.id = e.game
WHERE e.id IN (SELECT export FROM targets)
ORDER BY g.name;

\if :{?apply}
COMMIT;
\echo 'Applied: the engine picks these up on its next tick.'
\else
ROLLBACK;
\echo 'Dry run: nothing changed. Run again with -v apply=1 to apply.'
\endif
