-- Error event types over a window: one row per distinct failure (where, what
-- it cost, what kind, which code on which route), most frequent first, with
-- how many games it touched, when it began and last happened, and an example.
--
-- `outcome`: failed = the job stopped; degraded = something is missing from
-- the result (an unread channel, a message without its files, reactions
-- without their users); ignored = a fallback covered it.
-- Discord codes: https://discord.com/developers/docs/topics/opcodes-and-status-codes#json
-- Times are UTC, as the table holds them.
WITH params AS (SELECT interval '24 hours' AS span)
SELECT area, operation, outcome, kind, code, status, route,
       count(*) AS events,
       count(DISTINCT game) AS games,
       min("at") AS first_seen,
       max("at") AS last_seen,
       (array_agg(message ORDER BY "at" DESC))[1] AS latest_message
FROM core."ErrorEvent", params
WHERE "at" >= (now() AT TIME ZONE 'UTC') - span
GROUP BY area, operation, outcome, kind, code, status, route
ORDER BY events DESC;
