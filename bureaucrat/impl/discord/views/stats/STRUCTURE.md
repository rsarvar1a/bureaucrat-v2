# Stats views

All three are ephemeral and bound to the guild (`entityId`). Logic that can be tested without a socket
is in `games/stats/`.

### `statsconfig`

`/stats config`. The normalization threshold on a stepper; each press needs `server.manage`.

### `statsranking`

`/stats ranking`. Every Player and Storyteller with a result on record, sorted and paged per viewer.

### `statsmessages`

`/stats messages`. Games and Users tabs over the rollups, which `refreshMessageStats` brings up to date
on each render. Renderers are in `messages/`, and the strip in `tabs.ts`. The Users tab is at the
five-row limit: strip, sort, roles, direction and pager, Dismiss.
