-- The latest error events in full, newest first: the place to look once the
-- summary says what to look for. Add a WHERE (operation = '…', game = '…',
-- outcome = 'failed') to narrow it. Times are UTC.
SELECT e."at", e.area, e.operation, e.outcome, e.kind, e.code, e.status, e.route, e.message,
       g.name AS game, e.channel, e.detail
FROM core."ErrorEvent" e
LEFT JOIN core."Game" g ON g.id = e.game
ORDER BY e."at" DESC
LIMIT 50;
