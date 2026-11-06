-- Error hotspots over a window, three ways:
--   1. code: the topmost frame in this repo (file:line) of each error's stack;
--   2. channels: the channels that fail most, with the game they belong to;
--   3. games: the exports that collect the most, by outcome.
-- A frame of `(none)` means the stack held only library frames: the
-- operation name says where it was caught. Times are UTC.
WITH params AS (SELECT interval '24 hours' AS span),
recent AS (
  SELECT e.*
  FROM core."ErrorEvent" e, params
  WHERE "at" >= (now() AT TIME ZONE 'UTC') - span
)
SELECT 'code' AS by, coalesce((regexp_match(detail ->> 'stack', 'bureaucrat/([^:)\s]+:\d+)'))[1], '(none)') AS hotspot,
       operation AS context, count(*) AS events, count(DISTINCT game) AS games
FROM recent
GROUP BY 2, 3
UNION ALL
SELECT 'channel', r.channel::text, coalesce(g.name, '(no game)') || ' · ' || string_agg(DISTINCT r.operation, ', '),
       count(*), count(DISTINCT r.game)
FROM recent r
LEFT JOIN core."Game" g ON g.id = r.game
WHERE r.channel IS NOT NULL
GROUP BY r.channel, g.name
UNION ALL
SELECT 'game', coalesce(g.name, r.game::text, '(none)'),
       'failed ' || count(*) FILTER (WHERE outcome = 'failed') || ' · degraded '
         || count(*) FILTER (WHERE outcome = 'degraded') || ' · ignored ' || count(*) FILTER (WHERE outcome = 'ignored'),
       count(*), 1
FROM recent r
LEFT JOIN core."Game" g ON g.id = r.game
WHERE r.game IS NOT NULL
GROUP BY g.name, r.game
ORDER BY by, events DESC
LIMIT 60;
