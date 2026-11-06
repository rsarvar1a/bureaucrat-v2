-- Offsite throughput per minute over the last 30 minutes, reading beside writing.
--
-- Writing: ExportMessage."copiedTo" is the id of the copy in the destination,
-- and a Discord id carries its creation time: (id >> 22) + 1420070400000 is
-- epoch ms. Reading: ExportMessage."readAt", stamped as the reader stores each
-- page (null before that column existed, and for rows cloned from a sibling).
--
-- `read_req_per_s` estimates the reader's bot-token requests: a page fetch per
-- hundred messages plus one per emoji per reacted message (`reactionsOf` in read.ts asks
-- who reacted, emoji by emoji). It leaves out thread listing, joins and
-- re-archives, so it is a floor. Every bot-token request shares one ceiling of
-- about 50 a second; webhook sends (writing) do not count against it.
--
-- Reading the shape:
--   read_req_per_s near 50, flat as readers rise  -> the global limit is the wall
--   reactions per read message high, per_reader low -> the reaction lookups are
--   per_writer near 30 and flat                   -> the per-channel webhook cap
--   per_writer well under 30 with writers idle    -> writers wait on something else
--                                                    (files, thread creation, DB)
-- The newest and oldest minutes are partial. Minutes are UTC: the tables hold UTC
-- wall-clock times, so every comparison is in UTC whatever the client's zone.
WITH minutes AS (
  SELECT generate_series(date_trunc('minute', (now() AT TIME ZONE 'UTC') - interval '30 minutes'), date_trunc('minute', (now() AT TIME ZONE 'UTC')), interval '1 minute') AS minute
), reads AS (
  SELECT date_trunc('minute', "readAt") AS minute,
         count(*) AS messages,
         count(DISTINCT export) AS readers,
         sum(jsonb_array_length(reactions)) AS reaction_lookups
  FROM core."ExportMessage"
  WHERE "readAt" >= (now() AT TIME ZONE 'UTC') - interval '31 minutes'
  GROUP BY 1
), writes AS (
  SELECT date_trunc('minute', to_timestamp((("copiedTo" >> 22) + 1420070400000) / 1000.0) AT TIME ZONE 'UTC') AS minute,
         count(*) AS messages,
         count(DISTINCT export) AS writers
  FROM core."ExportMessage"
  WHERE "copiedTo" >= ((extract(epoch FROM now() - interval '31 minutes') * 1000)::bigint - 1420070400000) << 22
  GROUP BY 1
)
SELECT m.minute,
       coalesce(r.messages, 0) AS read,
       coalesce(r.readers, 0) AS readers,
       round(r.messages::numeric / nullif(r.readers, 0), 1) AS per_reader,
       coalesce(r.reaction_lookups, 0) AS reactions,
       round((ceil(coalesce(r.messages, 0) / 100.0) + coalesce(r.reaction_lookups, 0)) / 60.0, 1) AS read_req_per_s,
       coalesce(w.messages, 0) AS written,
       coalesce(w.writers, 0) AS writers,
       round(w.messages::numeric / nullif(w.writers, 0), 1) AS per_writer
FROM minutes m
LEFT JOIN reads r USING (minute)
LEFT JOIN writes w USING (minute)
ORDER BY m.minute DESC;
