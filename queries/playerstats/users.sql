-- Users ranked by one metric, in one table:
--
--   BUREAUCRAT_PROD_TIMEOUT=5min bun prodsql < queries/playerstats/users.sql
--   ... bun prodsql -v rank=per_game < queries/playerstats/users.sql
--   ... bun prodsql -v rank=density -v min_messages=1000 -v top=100 < queries/playerstats/users.sql
--
--   rank=count     every human message they posted (the default)
--   rank=per_game  their messages in play, per game they played in
--   rank=density   their average rate across their games, see below
--
-- Only human messages count: no bots, webhooks or system messages. A user took
-- part in a game if they posted in it, since older games have no Participant
-- rows, so Storytellers and Kibitzers are ranked alongside players. Each game
-- counts once, through its largest export.
--
-- A user's rate in a game is their messages per day of its stretch of play:
-- split the game's human messages wherever more than a week passes between two
-- of them and keep the stretch with the most, which drops setup before a long
-- wait for the start and a hall of fame thread years later. A game is at least
-- a day, so one over within hours cannot dominate. Messages outside the stretch
-- count for `messages` but not for density. Density averages those rates:
--   density         weighted by the user's own messages in each game's play
--   density_by_size weighted by each game's total messages in play
-- The first leans on the games they talked most in; the second on the biggest
-- games they were in. `games` counts games with a message in play, so a lone
-- post in an old game's hall of fame thread does not count as playing it.
--
-- The per_game and density rankings leave out anyone under `min_messages` in
-- play (default 500), whose few games would make them noise.
--
-- Scans every message, so it may outrun prodsql's 30s timeout: prefix either
-- command with BUREAUCRAT_PROD_TIMEOUT=5min. The temp tables go when psql exits.
\if :{?min_messages}
\else
\set min_messages 500
\endif
\if :{?top}
\else
\set top 50
\endif
\if :{?rank}
\else
\set rank count
\endif

-- Refused before the scan, not after it.
SELECT :'rank' IN ('count', 'per_game', 'density') AS rank_known \gset
\if :rank_known
\else
\echo 'rank must be one of: count, per_game, density'
\quit
\endif

CREATE TEMP TABLE by_author AS
WITH canonical AS (
  SELECT DISTINCT ON (game) id
  FROM core."GameExport"
  ORDER BY game, messages DESC, id
),
stepped AS (
  SELECT m.export,
         m.author,
         m."createdAt" AS at,
         m."createdAt" - lag(m."createdAt") OVER (PARTITION BY m.export ORDER BY m."createdAt") AS gap
  FROM core."ExportMessage" m
  JOIN canonical c ON c.id = m.export
  WHERE NOT m.bot AND NOT m.system
),
stretched AS (
  SELECT *,
         count(*) FILTER (WHERE gap > interval '7 days')
           OVER (PARTITION BY export ORDER BY at ROWS UNBOUNDED PRECEDING) AS stretch
  FROM stepped
),
sized AS (
  SELECT *, count(*) OVER (PARTITION BY export, stretch) AS size
  FROM stretched
),
marked AS (
  SELECT *,
         stretch = first_value(stretch) OVER (PARTITION BY export ORDER BY size DESC, stretch) AS played
  FROM sized
)
SELECT export,
       author,
       count(*) AS messages,
       count(*) FILTER (WHERE played) AS played,
       min(at) FILTER (WHERE played) AS first_at,
       max(at) FILTER (WHERE played) AS last_at
FROM marked
GROUP BY export, author;

CREATE TEMP TABLE by_user AS
WITH game_totals AS (
  SELECT export,
         sum(played) AS total,
         greatest(extract(epoch FROM max(last_at) - min(first_at)) / 86400, 1)::numeric AS days
  FROM by_author
  GROUP BY export
),
names AS (
  SELECT DISTINCT ON (x.member) x.member, x."displayName", x.username
  FROM core."ExportMember" x
  JOIN core."GameExport" e ON e.id = x.export
  ORDER BY x.member, e."updatedAt" DESC
)
SELECT a.author,
       coalesce(n."displayName", a.author::text) AS "user",
       n.username,
       sum(a.messages)::bigint AS messages,
       sum(a.played)::bigint AS played,
       count(*) FILTER (WHERE a.played > 0) AS games,
       round(sum(a.played)::numeric / nullif(count(*) FILTER (WHERE a.played > 0), 0), 1) AS per_game,
       round(sum(a.played * (a.played / g.days)) / nullif(sum(a.played), 0), 1) AS density,
       round(sum(g.total * (a.played / g.days)) FILTER (WHERE a.played > 0)
             / nullif(sum(g.total) FILTER (WHERE a.played > 0), 0), 1) AS density_by_size
FROM by_author a
JOIN game_totals g USING (export)
LEFT JOIN names n ON n.member = a.author
GROUP BY a.author, n."displayName", n.username;

SELECT rank() OVER (ORDER BY metric DESC) AS rank,
       "user", username, played as messages, games, per_game, density, density_by_size
FROM (
  SELECT *,
         CASE :'rank'
           WHEN 'count' THEN played::numeric
           WHEN 'per_game' THEN per_game
           WHEN 'density' THEN density
         END AS metric
  FROM by_user
) ranked
WHERE :'rank' = 'count' OR (played >= :min_messages AND metric IS NOT NULL)
ORDER BY rank, "user"
LIMIT :top;
