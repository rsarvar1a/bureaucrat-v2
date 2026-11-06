-- Takes the results off the server's V2 test games, so `/stats ranking` does not
-- count them. Their winners go with their results; the games, their Participants
-- and everything else stay.
--
--   bun prodsql < queries/mitigations/20261106_remove-test-game-results.sql
--       a dry run: shows what it would do, changes nothing
--   bun prodsql -v apply=1 < queries/mitigations/20261106_remove-test-game-results.sql
--       applies it; safe with the bot running, and safe to run again

BEGIN;

CREATE TEMP TABLE targets ON COMMIT DROP AS
SELECT o.id, g.name, g."endedAt"::date AS ended, o.position, o.winner,
       (SELECT count(*) FROM core."GameWinner" w WHERE w.outcome = o.id) AS winners
FROM core."Game" g
JOIN core."GameOutcome" o ON o.game = g.id
WHERE g.name IN ('amy-was-the-demon', 'NomTest', 'TB+Atheist', 'Demon Hop Scotch', 'clocktower.live upload test');

\echo
\echo 'Results this run removes:'
SELECT name, ended, position, winner, winners FROM targets ORDER BY ended, name, position;

DELETE FROM core."GameOutcome" WHERE id IN (SELECT id FROM targets);

\if :{?apply}
COMMIT;
\echo 'Applied.'
\else
ROLLBACK;
\echo 'Dry run: nothing changed. Run again with -v apply=1 to apply.'
\endif
