-- Put exports stopped by a passing failure back in the queue, in bulk: what the
-- card's Retry does (`retryExport`), one game at a time, without the clicking.
-- Each goes back to reading unless every channel was read, then to copying, and
-- carries on where it stopped. Nothing is skipped or re-sent by this.
--
-- This is not the re-read of skipped channels: an export whose channels were
-- marked read without being read needs 20261105_reread-transient-skips.sql, so
-- run that one's dry run first.
--
--   bun prodsql < queries/mitigations/20261106_requeue-passing-failures.sql
--       a dry run: shows what it would do, changes nothing
--   bun prodsql -v apply=1 < queries/mitigations/20261106_requeue-passing-failures.sql
--       applies it; safe with the bot running, since the engine ignores failed rows
--
-- A failure that does not look like a passing one is listed and left alone. A
-- bare `Failed query` counts: the old message hid its cause, and a retry that
-- meets a real fault only stops again. Safe to run again.

BEGIN;

CREATE TEMP TABLE targets ON COMMIT DROP AS
SELECT e.id,
       CASE
         WHEN c.channels > 0 AND c.channels = c.read_done THEN CASE WHEN e.copy THEN 'copying' ELSE 'read' END
         ELSE 'reading'
       END AS stage
FROM core."GameExport" e
CROSS JOIN LATERAL (
  SELECT count(*) AS channels, count(*) FILTER (WHERE "readDone") AS read_done
  FROM core."ExportChannel"
  WHERE export = e.id
) c
WHERE e.state = 'failed'
  AND e.error ~ '(EAI_AGAIN|CONNECT_TIMEOUT|ECONNRESET|ETIMEDOUT|^Failed query: )';

\echo
\echo 'Failed exports, and what this run does with each:'
SELECT g.name AS game,
       e.copied || '/' || e.messages AS messages,
       coalesce(t.stage, 'left alone') AS action,
       left(regexp_replace(e.error, '\s+', ' ', 'g'), 70) AS error
FROM core."GameExport" e
JOIN core."Game" g ON g.id = e.game
LEFT JOIN targets t ON t.id = e.id
WHERE e.state = 'failed'
ORDER BY action, g.name;

UPDATE core."GameExport" e
SET state = t.stage::core."ExportState",
    error = NULL,
    "notBefore" = NULL,
    "updatedAt" = now() AT TIME ZONE 'UTC'
FROM targets t
WHERE e.id = t.id
  AND e.state = 'failed';

\if :{?apply}
COMMIT;
\echo 'Applied: the engine picks these up on its next tick.'
\else
ROLLBACK;
\echo 'Dry run: nothing changed. Run again with -v apply=1 to apply.'
\endif
