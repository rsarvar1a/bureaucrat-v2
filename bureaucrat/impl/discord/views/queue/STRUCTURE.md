## Views

The queue views are:

### `queue`

Implements a top-level queue. Its **Claim Slot** button is for the Storyteller whose entry is at
the front: that entry becomes a game and any others they hold stay queued.

### `queuemanage`

A tabbed management pane for a queue. **Description** edits the name and description and toggles entry previews on the card;
**Resources** steps the concurrency and the entries each Storyteller may hold, with `<<`/`>>` for
big jumps and `∞` below the minimum; **Category** picks the category its games are created in and
the archive they are filed in once ended (the server's default archive, from `/archives manage`,
when unset);
**Delete** removes the queue behind a confirm. Renderers live in `settings/`.

### `qentry`

Implements a queue entry from a prospective Storyteller. When the entry carries a script PDF, a
**Preview** button opens `gscriptpreview` (the game's page viewer, pointed at the entry's `Script`
row) so hopefuls can read the script before signing up.

### `qmanage`

A tabbed management pane for a queue entry. **Details** edits the title, description and start
date, sets the signup mode (open, applications or closed), bumps the entry, and uploads, replaces
or removes a script PDF (a `Script` row owned by the entry, rasterised on upload, handed to the
game when the entry is claimed); **Signups** filters signups by role and accepts, declines or
resets them; **Delete** removes the entry behind a confirm. The tab strip is the `tabs` component; renderers live in `manage/`.

### `qoffer`

A public card in the entries thread when a slot opens: the Storyteller at the front of the queue
is asked to claim it or pass, and a pass asks the next entry.

### `qsignup`

A view to allow a server user to edit or delete their signup on a particular queue entry.

## Architecture

Queue views follow the hierarchy below:

```
* queue
    1 queuemanage
    * qentry
        1 qmanage
        * qsignup
    ? qoffer
```
