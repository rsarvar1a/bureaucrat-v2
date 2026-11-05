-- Where the offsite workers are right now: unfinished exports by state, split
-- into those that moved in the last minute (running: the reader reports every
-- page, the writer every message), those paused for Discord's thread limit
-- (`deferred`, claimed again once their window opens) and those waiting for a
-- slot. Compare `running` with OFFSITE_READERS and OFFSITE_WRITERS: reading
-- and copying have separate slots. `slowest` is the longest a running one has
-- gone without moving (a reader inside a reaction-heavy page); a reader stuck
-- in one page for over a minute counts as waiting, so `running` below the
-- slots with work waiting is itself a sign of slow pages.
SELECT state,
       count(*) FILTER (WHERE "updatedAt" >= (now() AT TIME ZONE 'UTC') - interval '1 minute') AS running,
       count(*) FILTER (WHERE "notBefore" > (now() AT TIME ZONE 'UTC')) AS deferred,
       count(*) FILTER (WHERE "updatedAt" < (now() AT TIME ZONE 'UTC') - interval '1 minute'
                          AND ("notBefore" IS NULL OR "notBefore" <= (now() AT TIME ZONE 'UTC'))) AS waiting,
       date_trunc('second', max((now() AT TIME ZONE 'UTC') - "updatedAt") FILTER (WHERE "updatedAt" >= (now() AT TIME ZONE 'UTC') - interval '1 minute')) AS slowest
FROM core."GameExport"
WHERE state NOT IN ('copied', 'failed', 'read') AND destination IS NOT NULL
GROUP BY state
ORDER BY state;
