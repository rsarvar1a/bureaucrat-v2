-- Where the offsite workers are right now: unfinished exports by state, split
-- into those that moved in the last minute (running: the reader reports every
-- page, the writer every message) and those waiting for a slot. The running
-- reading/copying split against OFFSITE_CONCURRENCY is the occupancy that
-- decides whether reading or writing holds the slots; `slowest` is the longest
-- a running one has gone without moving (a reader inside a reaction-heavy page).
-- A reader stuck in one page for over a minute counts as waiting, so `running`
-- below OFFSITE_CONCURRENCY with work waiting is itself a sign of slow pages.
SELECT state,
       count(*) FILTER (WHERE "updatedAt" >= (now() AT TIME ZONE 'UTC') - interval '1 minute') AS running,
       count(*) FILTER (WHERE "updatedAt" < (now() AT TIME ZONE 'UTC') - interval '1 minute') AS waiting,
       date_trunc('second', max((now() AT TIME ZONE 'UTC') - "updatedAt") FILTER (WHERE "updatedAt" >= (now() AT TIME ZONE 'UTC') - interval '1 minute')) AS slowest
FROM core."GameExport"
WHERE state NOT IN ('copied', 'failed', 'read') AND destination IS NOT NULL
GROUP BY state
ORDER BY state;
