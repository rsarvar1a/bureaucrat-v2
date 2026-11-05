-- The whole offsite queue: copy rate over the last 10 minutes, the messages
-- written and still to copy, and a rough ETA. `written` and `pct_complete` count
-- every export with a destination that has not failed, finished ones included,
-- since a finished copy leaves the queue and would otherwise take its messages
-- with it; `remaining` counts only unfinished ones (a finished copy without its
-- private threads has messages it deliberately left behind). Reads carry no
-- timestamp, so exports still `reading` keep adding to `remaining`: while
-- `still_reading` > 0 the ETA is a lower bound and the percentage an upper one.
-- See offsite-throughput-by-minute.sql for the timing trick.
with
  rate as (
    select
      count(*) / 10.0  as per_min
    from
      core."ExportMessage"
    where
      "copiedTo" >= (
        (
          extract(
            epoch
            from
              now() - interval '10 minutes'
          ) * 1000
        )::bigint - 1420070400000
      ) << 22
  ),
  backlog as (
    select
      sum(copied)  as written,
      sum(messages - copied) filter (
        where
          state <> 'copied'
      )            as remaining,
      count(*) filter (
        where
          state = 'reading'
      )            as still_reading,
      count(*) filter (
        where
          state <> 'copied'
      )            as exports
    from
      core."GameExport"
    where
      state <> 'failed'
      and destination is not null
  )
select
  round(per_min)                                                           as msgs_per_min,
  written,
  remaining,
  round(100.0 * written / nullif(written + coalesce(remaining, 0), 0), 1)  as pct_complete,
  exports,
  still_reading,
  make_interval(secs => round(remaining / nullif(per_min, 0) * 60))        as eta
from
  rate,
  backlog
;