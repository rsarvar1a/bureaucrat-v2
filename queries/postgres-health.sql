-- Postgres's own view of itself: connections, what they are waiting on, what
-- has run long or is blocked, and its counters. Read-only.
--
--   bun prodsql < queries/postgres-health.sql
--
-- `waits` is the quickest read: many `active` rows with no wait event are on
-- the CPU, `IO` waits are the disk, `Lock`/`LWLock` are contention, and
-- `Client: ClientRead` is Postgres waiting on the bot, not the other way round.
--
-- `counters` and `tables` count from `stats_reset`, so one run gives totals,
-- not rates: run it twice and compare. Postgres keeps no queryable record of
-- its errors, so these only count them (rollbacks, deadlocks, sessions lost);
-- the messages are in the container's log.

\echo
\echo 'connections, against max_connections:'
SELECT coalesce(a.backend_type, 'total') AS backend,
       count(*) AS connections,
       count(*) FILTER (WHERE a.state = 'active') AS active,
       count(*) FILTER (WHERE a.state = 'idle') AS idle,
       count(*) FILTER (WHERE a.state LIKE 'idle in transaction%') AS idle_in_xact,
       current_setting('max_connections') AS max
FROM pg_stat_activity a
GROUP BY ROLLUP (a.backend_type)
ORDER BY a.backend_type NULLS LAST;

\echo
\echo 'waits, client connections only:'
SELECT a.state,
       coalesce(a.wait_event_type || ': ' || a.wait_event, '(on cpu)') AS wait,
       count(*) AS connections
FROM pg_stat_activity a
WHERE a.backend_type = 'client backend'
  AND a.pid <> pg_backend_pid()
GROUP BY 1, 2
ORDER BY connections DESC, 1, 2;

\echo
\echo 'long-running: a query active over 5s, or a transaction open over a minute:'
SELECT a.pid,
       a.state,
       date_trunc('second', now() - a.query_start) AS query_age,
       date_trunc('second', now() - a.xact_start) AS xact_age,
       coalesce(a.wait_event_type || ': ' || a.wait_event, '') AS wait,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 100) AS query
FROM pg_stat_activity a
WHERE a.backend_type = 'client backend'
  AND a.pid <> pg_backend_pid()
  AND ((a.state = 'active' AND a.query_start < now() - interval '5 seconds')
       OR a.xact_start < now() - interval '1 minute')
ORDER BY a.xact_start NULLS LAST, a.query_start
LIMIT 20;

\echo
\echo 'blocked, and by whom:'
SELECT a.pid,
       pg_blocking_pids(a.pid) AS blocked_by,
       date_trunc('second', now() - a.query_start) AS query_age,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 100) AS query
FROM pg_stat_activity a
-- pg_blocking_pids takes the lock manager's locks, so only for those waiting on one.
WHERE a.wait_event_type = 'Lock'
ORDER BY a.query_start
LIMIT 20;

\echo
\echo 'counters, since stats_reset:'
SELECT d.datname,
       date_trunc('second', d.stats_reset) AS stats_reset,
       d.xact_commit AS commits,
       d.xact_rollback AS rollbacks,
       d.deadlocks,
       d.sessions_fatal,
       d.sessions_killed,
       d.sessions_abandoned,
       d.temp_files,
       pg_size_pretty(d.temp_bytes) AS temp_size,
       round(100.0 * d.blks_hit / nullif(d.blks_hit + d.blks_read, 0), 2) AS cache_hit_pct
FROM pg_stat_database d
WHERE d.datname = current_database();

\echo
\echo 'checkpoints: requested far above timed means WAL is outrunning max_wal_size:'
SELECT c.num_timed AS timed,
       c.num_requested AS requested,
       round(c.write_time::numeric / 1000) AS write_s,
       round(c.sync_time::numeric / 1000) AS sync_s,
       pg_size_pretty(w.wal_bytes) AS wal_written,
       date_trunc('second', c.stats_reset) AS stats_reset
FROM pg_stat_checkpointer c
CROSS JOIN pg_stat_wal w;

\echo
\echo 'tables, busiest first: high avg_seq_rows on a busy table suggests a missing index:'
SELECT t.schemaname || '.' || t.relname AS "table",
       pg_size_pretty(pg_total_relation_size(t.relid)) AS size,
       t.n_live_tup AS live,
       t.n_dead_tup AS dead,
       t.seq_scan,
       t.seq_tup_read / nullif(t.seq_scan, 0) AS avg_seq_rows,
       t.idx_scan,
       t.n_tup_ins AS inserts,
       t.n_tup_upd AS updates,
       date_trunc('second', greatest(t.last_autovacuum, t.last_vacuum)) AS vacuumed
FROM pg_stat_user_tables t
ORDER BY t.seq_tup_read + coalesce(t.idx_tup_fetch, 0) + t.n_tup_ins + t.n_tup_upd DESC
LIMIT 10;

\echo
\echo 'settings that matter here:'
SELECT s.name, s.setting, s.unit, s.source
FROM pg_settings s
WHERE s.name IN ('shared_buffers', 'work_mem', 'max_wal_size', 'synchronous_commit',
                 'effective_cache_size', 'autovacuum', 'shared_preload_libraries')
ORDER BY s.name;
