-- Totals across the archive: games, channels, threads and messages.
--
--   bun prodsql < queries/playerstats/totals.sql
--
-- Counts what the offsite exports have read, so a game with no export is not
-- here and one still `reading` is partial (`games_still_reading`). A game can
-- have several exports holding the same messages, so each game counts once,
-- through its largest. `human_messages` leaves out bots, webhooks and Discord's
-- system messages. Scans every message, so it may outrun prodsql's 30s timeout:
-- BUREAUCRAT_PROD_TIMEOUT=5min bun prodsql < queries/playerstats/totals.sql
WITH canonical AS (
  SELECT DISTINCT ON (game) id, state
  FROM core."GameExport"
  ORDER BY game, messages DESC, id
),
channels AS (
  SELECT count(*) AS channels,
         count(*) FILTER (WHERE c.kind = 'channel') AS main_channels,
         count(*) FILTER (WHERE c.kind <> 'channel') AS threads,
         count(*) FILTER (WHERE c.kind = 'public') AS public_threads,
         count(*) FILTER (WHERE c.kind = 'private') AS private_threads
  FROM core."ExportChannel" c
  JOIN canonical ON canonical.id = c.export
),
messages AS (
  SELECT count(*) AS messages,
         count(*) FILTER (WHERE NOT m.bot AND NOT m.system) AS human_messages,
         count(DISTINCT m.author) FILTER (WHERE NOT m.bot AND NOT m.system) AS authors
  FROM core."ExportMessage" m
  JOIN canonical c ON c.id = m.export
)
SELECT (SELECT count(*) FROM canonical) AS games,
       (SELECT count(*) FROM canonical WHERE state = 'reading') AS games_still_reading,
       channels.main_channels,
       channels.threads,
       channels.public_threads,
       channels.private_threads,
       messages.messages,
       messages.human_messages,
       messages.authors
FROM channels, messages;
