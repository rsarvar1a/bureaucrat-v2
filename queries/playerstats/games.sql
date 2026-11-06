-- Games ranked by human messages, with the size of each and how long it ran.
--
--   BUREAUCRAT_PROD_TIMEOUT=5min bun prodsql < queries/playerstats/games.sql
--
-- `human` leaves out bots, webhooks and system messages; `all` keeps them.
--
-- How long a game ran comes from its stretch of play: split its human messages
-- wherever more than a week passes between two of them, and keep the stretch
-- with the most. That drops setup before a long wait for the start as well as
-- a hall of fame thread years later. `outside_play` counts what it left out, so
-- a big number there is worth a look; `human` still counts it for the ranking.
-- A game is at least a day for `per_day`. Each game counts once, through its
-- largest export; see `state` for one still being read. Scans every message.
WITH canonical AS (
  SELECT DISTINCT ON (game) id, game, state
  FROM core."GameExport"
  ORDER BY game, messages DESC, id
),
-- Bots get partitions of their own, so one scan serves `all` and the stretches.
stepped AS (
  SELECT m.export,
         m.author,
         m."createdAt" AS at,
         NOT m.bot AND NOT m.system AS human,
         m."createdAt" - lag(m."createdAt") OVER by_time AS gap
  FROM core."ExportMessage" m
  JOIN canonical c ON c.id = m.export
  WINDOW by_time AS (PARTITION BY m.export, NOT m.bot AND NOT m.system ORDER BY m."createdAt")
),
stretched AS (
  SELECT *,
         count(*) FILTER (WHERE gap > interval '2 days')
           OVER (PARTITION BY export, human ORDER BY at ROWS UNBOUNDED PRECEDING) AS stretch
  FROM stepped
),
sized AS (
  SELECT *, count(*) OVER (PARTITION BY export, human, stretch) AS size
  FROM stretched
),
marked AS (
  SELECT *,
         human AND stretch = first_value(stretch) OVER (PARTITION BY export, human ORDER BY size DESC, stretch) AS played
  FROM sized
),
tallies AS (
  SELECT export,
         count(*) FILTER (WHERE human) AS human,
         count(*) AS "all",
         count(*) FILTER (WHERE human AND NOT played) AS outside_play,
         count(DISTINCT author) FILTER (WHERE human) AS authors,
         count(*) FILTER (WHERE played) AS played,
         min(at) FILTER (WHERE played) AS first_at,
         max(at) FILTER (WHERE played) AS last_at
  FROM marked
  GROUP BY export
),
threads AS (
  SELECT ch.export, count(*) FILTER (WHERE ch.kind <> 'channel') AS threads
  FROM core."ExportChannel" ch
  JOIN canonical c ON c.id = ch.export
  GROUP BY ch.export
)
SELECT rank() OVER (ORDER BY t.human DESC) AS rank,
       g.name AS game,
       t.human as messages,
       coalesce(th.threads, 0) AS threads,
       -- t."all",
       -- t.outside_play,
       t.authors as members,
       t.first_at::date AS started,
       t.last_at::date AS ended,
       -- round((extract(epoch FROM t.last_at - t.first_at) / 86400)::numeric, 1) AS days,
       round(t.played / greatest(extract(epoch FROM t.last_at - t.first_at) / 86400, 1)::numeric, 1) AS per_day
FROM tallies t
JOIN canonical c ON c.id = t.export
JOIN core."Game" g ON g.id = c.game
LEFT JOIN threads th ON th.export = t.export
ORDER BY rank, g.name;
