-- The whole offsite queue: copy rate over the last 10 minutes, the messages
-- written and still to copy, and a rough ETA. `written` and `pct_complete` count
-- every export with a destination that has not failed, finished ones included,
-- since a finished copy leaves the queue and would otherwise take its messages
-- with it; `remaining` counts only unfinished ones (a finished copy without its
-- private threads has messages it deliberately left behind). Reads carry no
-- timestamp, so exports still `reading` keep adding to `remaining`: while
-- `still_reading` > 0 the ETA is a lower bound and the percentage an upper one.
-- See offsite-throughput-by-minute.sql for the timing trick.
--
-- Threads have a floor of their own: Discord lets a server gain about twenty
-- threads in five minutes (observed), whatever the writers. `threads_left` is
-- the threads still to make (private ones only where the server copies them),
-- `thread_eta` that at four a minute, and `eta` the longer of the two.
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
  ),
  threads as (
    select
      count(*)  as threads_left
    from
      core."ExportChannel" c
      join core."GameExport" e on e.id = c.export
      join core."Game" g on g.id = e.game
      left join core."GuildSettings" s on s.guild = g.guild
    where
      e.state in ('reading', 'copying')
      and e.destination is not null
      and c.kind <> 'channel'
      and c."copiedTo" is null
      and (c.kind = 'public' or coalesce(s."offsitePrivate", false))
  )
select
  round(per_min)                                                           as msgs_per_min,
  written,
  remaining,
  round(100.0 * written / nullif(written + coalesce(remaining, 0), 0), 1)  as pct_complete,
  exports,
  still_reading,
  threads_left,
  make_interval(secs => round(threads_left / 4.0 * 60))                    as thread_eta,
  make_interval(secs => greatest(
    round(remaining / nullif(per_min, 0) * 60),
    round(threads_left / 4.0 * 60)
  ))                                                                       as eta
from
  rate,
  backlog,
  threads
;