-- Error density: events per bucket over a window, split by outcome, with the
-- operation that produced the most in each bucket. Bursts line up with what
-- the bot was doing then (a sync, a deploy, a Discord incident); compare with
-- offsite-throughput-by-minute.sql for the same minutes. Times are UTC.
WITH params AS (SELECT interval '6 hours' AS span, interval '10 minutes' AS bucket),
buckets AS (
  SELECT date_bin(bucket, "at", timestamp '2000-01-01') AS bucket, operation, outcome
  FROM core."ErrorEvent", params
  WHERE "at" >= (now() AT TIME ZONE 'UTC') - span
), tops AS (
  SELECT DISTINCT ON (bucket) bucket, operation AS top_operation, count(*) AS top_events
  FROM buckets
  GROUP BY bucket, operation
  ORDER BY bucket, count(*) DESC
)
SELECT b.bucket,
       count(*) AS events,
       count(*) FILTER (WHERE outcome = 'failed') AS failed,
       count(*) FILTER (WHERE outcome = 'degraded') AS degraded,
       count(*) FILTER (WHERE outcome = 'ignored') AS ignored,
       t.top_operation, t.top_events
FROM buckets b
JOIN tops t USING (bucket)
GROUP BY b.bucket, t.top_operation, t.top_events
ORDER BY b.bucket DESC;
