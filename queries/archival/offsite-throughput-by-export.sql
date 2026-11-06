-- Offsite throughput per export over the last 5 minutes: what each running job
-- read and wrote, and the time left on its copy at the current rate. See
-- offsite-throughput-by-minute.sql for where the timings come from.
--
-- A reader with few messages but many reactions per message is paying for
-- reaction lookups; a high `idle` on a reader means it is stuck inside one page.
-- The tables hold UTC wall-clock times, so comparisons are made in UTC.
WITH window_ AS (
  SELECT now() - interval '5 minutes' AS since
), reads AS (
  SELECT export, count(*) AS read, sum(jsonb_array_length(reactions)) AS reactions
  FROM core."ExportMessage", window_
  WHERE "readAt" >= since AT TIME ZONE 'UTC'
  GROUP BY export
), writes AS (
  SELECT export, count(*) AS written
  FROM core."ExportMessage", window_
  WHERE "copiedTo" >= ((extract(epoch FROM since) * 1000)::bigint - 1420070400000) << 22
  GROUP BY export
)
SELECT g.name, e.state,
       round(coalesce(r.read, 0) / 5.0, 1) AS read_per_min,
       round(r.reactions::numeric / nullif(r.read, 0), 2) AS reactions_per_msg,
       round(coalesce(w.written, 0) / 5.0, 1) AS written_per_min,
       e.copied, e.messages,
       make_interval(secs => round((e.messages - e.copied) / nullif(w.written / 5.0, 0) * 60)) AS eta,
       date_trunc('second', (now() AT TIME ZONE 'UTC') - e."updatedAt") AS idle
FROM core."GameExport" e
JOIN core."Game" g ON g.id = e.game
LEFT JOIN reads r ON r.export = e.id
LEFT JOIN writes w ON w.export = e.id
WHERE r.export IS NOT NULL OR w.export IS NOT NULL
ORDER BY e.state, read_per_min DESC, written_per_min DESC;
