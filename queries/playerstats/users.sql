-- Users ranked by one metric, in one table:
--
--   BUREAUCRAT_PROD_TIMEOUT=5min bun prodsql < queries/playerstats/users.sql
--   ... bun prodsql -v rank=per_game < queries/playerstats/users.sql
--   ... bun prodsql -v rank=win_rate -v filter=evil < queries/playerstats/users.sql
--   ... bun prodsql -v rank=per_day -v min_messages=1000 -v top=100 < queries/playerstats/users.sql
--
--   rank=count      their human messages in play (the default)
--   rank=per_game   their messages in play, per game they posted in
--   rank=per_day    their average rate across their games, see below
--   rank=endurance  the same rate weighted towards the biggest games, see below
--   rank=win_rate   the share of their results they won, see below
--   rank=evil_rate  the share of their results they were evil for
--
--   filter=player       only games they were a Player in
--   filter=storyteller  only games they were a Storyteller in
--   filter=good, evil   only games they finished on that team
--   filter=won, lost    only games they won or lost
--
-- Left out, `filter` takes in every game they posted in. It limits the messages
-- and the rates alike, so `filter=evil` gives their win rate as evil. Messages
-- cannot be split by colour, so a multicolour game counts under each side they
-- played; its rates are still split by colour.
--
-- Only human messages count: no bots, webhooks or system messages. Without a
-- filter a user took part in a game if they posted in it, so Storytellers and
-- Kibitzers are ranked alongside players. Each game counts once, through its
-- largest export.
--
-- A user's rate in a game is their messages per day of its stretch of play:
-- split the game's human messages wherever more than two days pass between two
-- of them and keep the stretch with the most, which drops setup before a long
-- wait for the start and a hall of fame thread years later. A game is at least
-- a day, so one over within hours cannot dominate. Messages outside the stretch
-- are not counted. Two averages of those rates:
--   per_day    weighted by the user's own messages in each game's play
--   endurance  weighted by each game's total messages in play
-- The first leans on the games they talked most in; the second on the biggest
-- games they were in. `games` counts games with a message in play, so a lone
-- post in an old game's hall of fame thread does not count as playing it.
--
-- win_rate and evil_rate are percentages over `results`: one for each result of
-- a game they were a Player in, so a multicolour game counts once per colour
-- while `games` counts it once. A player on no winning team was on the side
-- opposite the winner. Only games with an export and a result on record count,
-- which leaves out games not yet exported and the server's test games.
--
-- Every ranking but count leaves out anyone under `min_messages` in play
-- (default 500), whose few games would make them noise. The two rate rankings
-- also leave out anyone under `min_results` (default 5).
--
-- Scans every message, so it may outrun prodsql's 30s timeout: prefix either
-- command with BUREAUCRAT_PROD_TIMEOUT=5min. The temp tables go when psql exits.
\if :{?min_messages}
\else
\set min_messages 500
\endif
\if :{?min_results}
\else
\set min_results 5
\endif
\if :{?top}
\else
\set top 50
\endif
\if :{?rank}
\else
\set rank count
\endif
\if :{?filter}
\else
\set filter all
\endif

-- Refused before the scan, not after it.
SELECT :'rank' IN ('count', 'per_game', 'per_day', 'endurance', 'win_rate', 'evil_rate') AS rank_known,
       :'filter' IN ('all', 'player', 'storyteller', 'good', 'evil', 'won', 'lost') AS filter_known \gset
\if :rank_known
\else
\echo 'rank must be one of: count, per_game, per_day, endurance, win_rate, evil_rate'
\quit
\endif
\if :filter_known
\else
\echo 'filter must be one of: player, storyteller, good, evil, won, lost'
\quit
\endif

CREATE TEMP TABLE canonical AS
SELECT DISTINCT ON (game) id, game
FROM core."GameExport"
ORDER BY game, messages DESC, id;

-- One row per Participant and result of a game; `side` is null with no result.
CREATE TEMP TABLE standings AS
WITH sided AS (
  SELECT c.id AS export,
         p.member,
         p.role,
         o.id AS outcome,
         w.id IS NOT NULL AS won,
         CASE
           WHEN o.id IS NULL THEN NULL
           WHEN w.id IS NOT NULL THEN o.winner::text
           WHEN o.winner = 'good' THEN 'evil'
           ELSE 'good'
         END AS side
  FROM canonical c
  JOIN core."Participant" p ON p.game = c.game
  LEFT JOIN core."GameOutcome" o ON o.game = c.game
  LEFT JOIN core."GameWinner" w ON w.outcome = o.id AND w.member = p.member
)
SELECT *,
       CASE :'filter'
         WHEN 'all' THEN true
         WHEN 'player' THEN role = 'Player'
         WHEN 'storyteller' THEN role = 'Storyteller'
         WHEN 'good' THEN role = 'Player' AND side = 'good'
         WHEN 'evil' THEN role = 'Player' AND side = 'evil'
         WHEN 'won' THEN role = 'Player' AND outcome IS NOT NULL AND won
         WHEN 'lost' THEN role = 'Player' AND outcome IS NOT NULL AND NOT won
       END AS matches
FROM sided;

CREATE TEMP TABLE by_author AS
WITH stepped AS (
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
         count(*) FILTER (WHERE gap > interval '2 days')
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
       round(sum(a.played * (a.played / g.days)) / nullif(sum(a.played), 0), 1) AS per_day,
       round(sum(g.total * (a.played / g.days)) FILTER (WHERE a.played > 0)
             / nullif(sum(g.total) FILTER (WHERE a.played > 0), 0), 1) AS endurance
FROM by_author a
JOIN game_totals g USING (export)
LEFT JOIN names n ON n.member = a.author
WHERE :'filter' = 'all'
   OR EXISTS (SELECT 1 FROM standings s WHERE s.export = a.export AND s.member = a.author AND s.matches)
GROUP BY a.author, n."displayName", n.username;

CREATE TEMP TABLE rates AS
SELECT member,
       count(*) AS results,
       round(100.0 * count(*) FILTER (WHERE won) / count(*), 1) AS win_rate,
       round(100.0 * count(*) FILTER (WHERE side = 'evil') / count(*), 1) AS evil_rate
FROM standings
WHERE role = 'Player' AND side IS NOT NULL AND matches
GROUP BY member;

SELECT rank() OVER (ORDER BY metric DESC) AS rank,
       "user", username, played as messages, games, per_game, per_day, endurance, win_rate, evil_rate, results
FROM (
  SELECT u.*,
         r.win_rate,
         r.evil_rate,
         coalesce(r.results, 0) AS results,
         CASE :'rank'
           WHEN 'count' THEN u.played::numeric
           WHEN 'per_game' THEN u.per_game
           WHEN 'per_day' THEN u.per_day
           WHEN 'endurance' THEN u.endurance
           WHEN 'win_rate' THEN r.win_rate
           WHEN 'evil_rate' THEN r.evil_rate
         END AS metric
  FROM by_user u
  LEFT JOIN rates r ON r.member = u.author
) ranked
WHERE :'rank' = 'count'
   OR (played >= :min_messages
       AND metric IS NOT NULL
       AND (:'rank' NOT IN ('win_rate', 'evil_rate') OR results >= :min_results))
ORDER BY rank, "user"
LIMIT :top;
