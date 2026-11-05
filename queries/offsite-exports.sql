-- Every offsite export's status, one row each: what it is doing, how far its
-- read and copy have got, and why it stopped if it did. By default only the
-- unfinished and failed ones; `-v all=1` adds finished copies and read-only
-- `/game export`s, `-v game=<name pattern>` narrows to matching games (ILIKE):
--
--   bun prodsql < queries/offsite-exports.sql
--   bun prodsql -v all=1 -v game='%mafia%' < queries/offsite-exports.sql
--
-- `status` splits the unfinished ones as offsite-phases.sql does: `running`
-- moved in the last minute, `deferred` waits out the thread limit until
-- `resumes_in`, `waiting` wants a slot. `channels_read` counts channels and
-- threads whose read is done; `threads` counts those copied of the ones to
-- copy (private threads only where the server copies them). `idle` is the time
-- since the row last moved. The tables hold UTC wall-clock times.
\if :{?all}
\else
\set all 0
\endif
\if :{?game}
\else
\set game '%'
\endif
WITH now_ AS (
  SELECT now() AT TIME ZONE 'UTC' AS at
), channels AS (
  SELECT c.export,
         count(*) AS channels,
         count(*) FILTER (WHERE c."readDone") AS read_done,
         count(*) FILTER (WHERE c.kind <> 'channel'
                            AND (c.kind = 'public' OR coalesce(s."offsitePrivate", false))) AS threads,
         count(*) FILTER (WHERE c.kind <> 'channel' AND c."copiedTo" IS NOT NULL) AS threads_copied
  FROM core."ExportChannel" c
  JOIN core."GameExport" e ON e.id = c.export
  JOIN core."Game" g ON g.id = e.game
  LEFT JOIN core."GuildSettings" s ON s.guild = g.guild
  GROUP BY c.export
), exports AS (
  SELECT e.*, g.name AS game_name, n.at,
         CASE
           WHEN e.state IN ('copied', 'failed', 'read') THEN e.state::text
           WHEN e."notBefore" > n.at THEN 'deferred'
           WHEN e."updatedAt" >= n.at - interval '1 minute' THEN 'running'
           ELSE 'waiting'
         END AS status
  FROM core."GameExport" e
  CROSS JOIN now_ n
  JOIN core."Game" g ON g.id = e.game
  WHERE (:all::int = 1 OR (e.destination IS NOT NULL AND e.state <> 'copied'))
    AND g.name ILIKE :'game'
)
SELECT e.game_name AS game,
       e.destination IS NULL AS read_only,
       e.state,
       e.status,
       coalesce(c.read_done, 0) || '/' || coalesce(c.channels, 0) AS channels_read,
       jsonb_array_length(e.unread) AS unread,
       e.copied || '/' || e.messages AS messages,
       round(100.0 * e.copied / nullif(e.messages, 0), 1) AS pct,
       coalesce(c.threads_copied, 0) || '/' || coalesce(c.threads, 0) AS threads,
       CASE WHEN e.status = 'deferred' THEN date_trunc('second', e."notBefore" - e.at) END AS resumes_in,
       date_trunc('second', e.at - e."updatedAt") AS idle,
       date_trunc('second', coalesce(e."finishedAt", e.at) - e."startedAt") AS elapsed,
       left(regexp_replace(e.error, '\s+', ' ', 'g'), 120) AS error,
       e.id
FROM exports e
LEFT JOIN channels c ON c.export = e.id
ORDER BY array_position(ARRAY['running', 'deferred', 'waiting', 'failed', 'copied', 'read'], e.status),
         e.state, round(100.0 * e.copied / nullif(e.messages, 0), 1) DESC NULLS LAST, e.game_name;
