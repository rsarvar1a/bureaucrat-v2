## Views

The game views live in GAME CONFIG, the private Storyteller thread every game opens with, as a
**stack** of messages: a header whose tabs decide what the message beneath it shows. Strips and
the per-window action lists are declared in `tabs.ts`, which a test checks for size and custom-id
length.

### `gconfig` (window A)

The navigation header. Name, state, phase, player and pending counts, then the strip:
Configuration / Seating / Messaging / Phases / Signups, and a **Start** confirm beneath it,
enabled while the game is in signups and somebody is seated.

### `gsetup` (window B, itself a header)

Script / Threads / Whispers / Nominations / Seating, with a one-line summary. A message of its
own beneath the root, with its leaves at C.

### `gscript` (window C)

The script, titled by its name (linked when there is a link), with the JSON and PDF attached. A
select picks which file to upload or remove (PDF, JSON, or a night order file: `firstNight` and
`otherNight` id lists, the official night sheet's shape, for scripts whose order cannot be
derived); Edit description opens the name-and-link modal.
Because it carries the files, it does not render on the game's `Changed` (every seat edit would
re-upload the PDF): its own handlers are the only writers of the Script row and re-render it
directly. `/game script` hands players the same files on an ephemeral card (`gscriptcard`) with its
own Preview, and a select here binds a public copy of that card to a planned thread (or nowhere):
placed at Start before the town square, so a thread bound to both reads script then seating, and
re-placed (`games/script-card.ts` closes it and posts it again) when the script or the binding
changes, since a card carrying files cannot redraw in place. Preview here, enabled when a PDF is attached,
opens `gscriptpreview`: an ephemeral pane showing one page behind `<< < Page n of N > >>` and a
Dismiss. The pages are rasterised once, at upload (`games/script/pdf.ts`, on the `mupdf`
WebAssembly build), into `ScriptPage` rows; a page turn is a row read.

### `gthreadplan` (window C)

The public threads to create when the game starts: a select picks one, and the row beneath
adds (modal), renames (modal, prefilled; every binding follows the name)
or deletes it.

### `gwhispers` (window C)

A mode cycle (synchronous, asynchronous, hybrid), the group, traveler and neighbour whisper toggles,
a stepper per allowance, each disabled in the modes it does not apply to, and a select binding
where whisper invitation cards are posted: a planned public thread (Whispers by default) or the
game channel. Every binding (nominations, script, seating, whispers) resolves through
`games/bound-thread.ts` and falls back to the game channel when its thread is gone.

### `gnominations` (window C)

How nominations run: which planned public thread (or the game channel) the day card and the
nomination cards post in, whether
the Storyteller may be nominated, and how long into a day nominations open on their own (blank
means the Storyteller opens them from Phases). The thread is kept by its planned name and resolved
by tag when a day opens. See **Nominations** below for the cards themselves.

### `gseatingconfig` (window C)

Where the players' town square (`gtownsquare`) is shown: a planned public thread by name, or
nowhere, whether roles are exposed, and whether roles are live. The square is placed at Start,
once the thread exists, and moved when the binding changes mid-game (`games/town-square.ts`
closes any copy before opening one). It shows the seating **as last published** from the Seating
tab (`games/published.ts`: a snapshot in `GameSettings.publishedSeating`), never the live rows,
so a death marked during the night stays with the Storytellers until they press Publish; with
**Roles · live** (the default) role and alignment changes come through at once, since they are
usually meant to be shared. States and travelers' roles are shown with mentions that never ping;
the square also carries a **Details** button, an ephemeral that, with roles exposed, adds the
player's own apparent role beneath the square, live or as published by the same rule, and that
shows a Storyteller or Kibitzer the whole chart as it stands (`seating/details.ts`). Download
for clocktower.live (anyone) answers with the published square as a game-state JSON for the site
(`games/clocktower-live.ts`): seats in order with their life states, a role only for Travelers,
and the script as the edition (an official one by its `_meta` id, else the script as a custom
edition). `/game
seating` gives the same reply from any of the game's channels. A square that opens on a game
never published publishes what Start found.

### `gseating` (window B)

The town square, live, with small print saying whether the players see this (**Publish**
freezes it for them and raises `Published`; the button is dead while nothing differs). Seat every
unseated Player or a chosen few; pick a seat to set its state from a
dropdown (Alive, Dead, No vote, with the Office's emotes), then say what the seat is: **Set
roles** (an ephemeral pane, `gseatroles`: a select and pager each for the true and apparent role
over the script's characters with their emotes when a script JSON is loaded, an alignment button
after each pager cycling Default, Good and Evil for that slot: the override colours every option in
the dropdown and survives a pick, so an evil Grandmother is one click, Set custom for the two-field modal, and the
Traveler toggle), **Set nickname**, and **Set player** (a different
unseated Player takes the seat; any occupant stays a Player, unseated; this is how an empty seat
is filled). The row beneath is where the seat is: move, swap, or remove. A role is shown with a custom emote
(`games/emotes.ts`, `games/script/alignment.ts`): the release icons are `<id>_g` and `<id>_e`, so
a role tries the icon of its alignment (the team's unless the seat sets one) before the plain
name, each from the game's own server first, then Bureaucrat's Office, the application's emoji,
then the rest. Remove unseats and leaves threads but
keeps the Player, so Add player offers them back. **Add empty** adds a seat with nobody in it
(`Seating.player` is null): the Storytellers' to run, or a game mechanic's, and fillable with a
real Player through Associate player or Substitute at any point. It is not a member and does not
appear in Signups. Start gives it an ST thread with the Storytellers alone.

### `gmessaging` (window B)

Announce posts to the game channel; Broadcast posts to every player's Storyteller thread.

### `gphases` (window B)

`<< < It is Day N > >>` (a whole day with the outer pair) and a jump select. On a Day the window
says how many nominations there are and who is on the block, with a button above the phase row
that opens, closes or reopens the day's nominations; any move closes the day, and a move backwards
first takes down the cards of the days it deletes and gives back the ghost votes spent in them.
On a Night the window also lists the night order, `n. <emote> reminder`, Night 1 as the first night and every other as
other nights (`games/script/night.ts`), with a button above the phase row cycling
**Apparent** (the default: seated players' true roles plus the roles they believe they have),
**All roles** (the script) and **In play** (true roles only); the markers always show. The order comes from the uploaded night order file, else the script's
`_meta`, else derived from the official night sheet (a fully official script) or from homebrew
priorities (a fully specced one). A script mixing the two, or a homebrew character acting without
a priority, gets a line asking for a night order file instead. Official data lives in
`games/script/data/` (see its README).

### `gsignups` (window B, itself a header)

Applications / Members / Substitute, with pending and member counts by role. A message of its
own, like `gsetup`.

### `gapplications` (window C)

What `/signups signup` (an ephemeral pane, `gsignup`: a role, then a note; or Withdraw for someone
already waiting) left pending: a role filter narrows the dropdown, which takes any number of
ticks; Accept (each a participant, joined to the threads its role gets) or Decline acts on the
batch, with one toast for the lot. The planned player count sits beneath as a stepper.

### `gmembers` (window C)

Participants by role. A user select adds one as the role whose list is up; a participant select
and a Remove confirm take one out, refusing the last Storyteller. The window writes names, since
a mention in the private thread would pull the person in; Peek members (and `/signups list`, for everyone) opens `gpeek`, an
ephemeral numbered list per role as mentions, where a ping reaches nobody.

### `gsubstitute` (window C)

A seated player going out, and an applicant or unseated Player coming in. The newcomer takes the
seat and every thread the outgoing player was in; the outgoing player leaves the game.

## Architecture

```
gconfig                     A: header, entityId = game (+ Start, then End game)
  ├─ gsetup                 B: header, Script | Threads | Whispers | Nominations | Seating
  │    ├─ gscript           C
  │    ├─ gthreadplan       C
  │    ├─ gwhispers         C
  │    ├─ gnominations      C
  │    └─ gseatingconfig    C
  ├─ gseating               B
  ├─ gmessaging             B
  ├─ gphases                B
  └─ gsignups               B: header, Applications | Members | Substitute
       ├─ gapplications     C
       ├─ gmembers          C
       │    └─ gpeek        ephemeral, the members as mentions
       └─ gsubstitute       C

gscriptcard                 public, in the thread Configuration > Script binds (ephemeral from /game script); no parent
gtownsquare                 public, in the thread Configuration > Seating binds; no parent
goffsite                    public, at the bottom of the game channel (/game export, /game offsite); no parent
grating                     public, in the reveal thread (/game rate as a Storyteller); no parent
  ├─ gratingform            ephemeral, a player's answers in the making (also from /game rate)
  └─ gratings               ephemeral, the Storytellers' averages and notes
gnomday                     public, in the thread Configuration > Nominations binds; entityId = phase
gnomination                 public, beside the day card; entityId = nomination
  └─ gnomst                 ephemeral, the Storyteller's console for that nomination
```

The root holds the main navigation and the game-state action (Start, then End game); a nested
header holds its own navigation; the content sits beneath both, so a stack is two or three
messages deep. A root tab may still `inline` its header's strip (`tabs.ts`) to save the middle
message, with a subtitle naming the root tab above the nested ribbon; nothing is inlined today.

Every window subscribes to `GameEvents.Changed` (render) and `GameEvents.Ended` (destroy). No
window has a Dismiss: the header above it closes it, and `/game end` closes the lot. Every write
a window makes ends in `notify(Changed)` so the header's counts and the sibling windows follow;
a confirm's `onConfirm` ends in `notifyAll`, since the confirm handler itself returns nothing.

The stack opens from `games/create.ts` (`openWindow` on `gconfig`, which recurses through the
registered headers) and is torn down by `games/end.ts`. `/game config`, the game owner's, takes
down whatever is there and opens a fresh stack (`games/reopen.ts`) when the old one is lost or
predates a deploy.

## Nominations (`views/nominations/`, `games/nominations/`)

A day's nominations **open** when the Storyteller presses Open nominations on Phases or when the
day has run for `nominationsAfter` seconds (an engine tick like the reminders', started in
`onClientReady`). Opening claims the day once (`claimNominationsOpen`, so the timer and the button
cannot both post), closes any other open day, and puts the **day card** (`gnomday`) in the bound
thread, pinned. The card lists today's nominations with a link to each card and where its count
stands, and offers Nominate: a modal whose select names the players still open to nomination
(travelers first, since a big game may not fit everyone in twenty-five; the Storyteller when
allowed) and takes the accusation. Closing, from Phases or by any phase move, stops only new
nominations; Phases can reopen it. Votes, accusations and defenses on the day's nominations stay
open until the game moves off that day (`votingLive`), and return if the Storyteller steps back to
it. A Storyteller can still write an accusation or defense from the console afterwards.

The day card's Manage opens the Storyteller's **block pane** (`gnomblock`), ephemeral: who is on
the block, and a select (none allowed) to put any of today's nominations there or clear it. The
count places the block itself as each nomination settles, and will again at the next settle; the
pane is the escape hatch for what the count cannot see.

Each nomination gets a **card** (`gnomination`) beside the day card: `p calls for the execution
(or exile) of q`, the count against the threshold, the accusation and the defense, and the ballot
in voting order as a numbered list, the next hand flagged 🕓 after its number and each seat's state
before its name. Two buttons: Vote and Manage. Vote is one form for everyone, a public text the
town reads and a private one for the Storytellers; the nominee's form carries their defense, the
accuser's the accusation while no hand is locked, a self-nominator's both; a Kibitzer, who has
no hand, gets the console's ballot read-only, private votes included (`nominations/peek.ts`).
Manage opens the
**console** (`gnomst`), ephemeral and a child of the card: the whole ballot as the card writes it
with each hand's private vote on a `-# privately:` line beneath it, Write a vote for a seat,
Accusation and Defense,
a select for what the lock will be (Yes, No, Bureaucrat ×3 and Thief −1 when on script, or Custom,
which brings up the `<< < > >>` weight row), a multiselect of seats, then Lock (the picked seats,
as the select says; a relock overwrites), Unlock (the picked seats), Default ❌ (every hand still
up, as a no), Finalize and Reset nomination (red, confirmed), with Dismiss on its own row. Locks
are provisional: the status stays 🔄, no ghost vote is spent and the block does not move until
Finalize calls the count (`Nomination.finalizedAt`), which needs every hand locked. The
Storyteller is not locked out after: a change to a finalized count is pushed through at once,
ghost votes reconciled, status re-read, block recomputed. Reset rerolls the
day's latest nomination against the grimoire as it stands (`games/nominations/reset.ts`): every
lock comes off and a spent ghost vote goes back, each hand's snapshot and the count required are
taken again, the block is recomputed; what the players wrote stays. It is for the effect the
count could not see, an accuser dying to a Witch, applied in Seating first. Only the latest, since
an earlier reroll would leave later nominations made against a grimoire that no longer held.

The rules (`games/nominations/rules.ts`, pure and tested):

- **Order.** Clockwise is increasing seat number. Voting starts at the seat after the nominee and
  ends on the nominee; with the Storyteller nominated it goes round from the accuser to end on the
  accuser. Every seat votes, an empty one (no Discord player behind it) through the Storyteller,
  so a seat is a player of the grimoire either way. The order is frozen in `Vote.position` when
  the nomination is made, with each seat's state then.
- **Threshold.** Half the living players rounded up to execute; half of everyone seated to exile.
  Frozen in `Nomination.required`. The count stays open until the last hand is locked, since a
  Thief can pull a reached count back.
- **Snapshot.** A nomination is a point in time. Each seat's state as it was made is frozen in
  `Vote.state`, the threshold in `Nomination.required`, and both are read from there, never from
  the grimoire as it stands: a player who dies between the nomination and their lock is alive for
  it, and a later death does not move the count required. Only nominating itself reads the live
  seat.
- **Ghost votes.** A player dead at the snapshot whose ✅ is finalized on anything but an exile
  spends their ghost vote: the seat goes `spent` if it is not already (another nomination that day
  may have got there first), and `Vote.spent` remembers whether this nomination did it so Reset
  gives back exactly that. A player whose snapshot says `spent` is refused; one whose snapshot says `dead` votes even
  if a later-made nomination spent it first, since they held it when this one was made. Anyone
  may vote on an exile.
- **Once a day.** Each player nominates once and is nominated once, exiles aside: calling for an
  exile costs no nomination and a traveler may face any number. Self-nomination is allowed. The
  partial unique indexes on `Nomination` have the last word, so two at once cannot both land.
- **The block.** When a nomination finishes, the passing executions (and Storyteller nominations)
  of the day are compared: the one with the most votes is on the block, a tie leaves nobody there.

Two labels keep the fan-out small (`views/nominations/events.ts`): a lock repaints its own card
(and consoles) and the day card, never every card of the day; when the block moves, every card of
the day repaints once. The cards are parentless, so they publish with the concrete builders
(`dayChanged`, `nominationChanged`, `gameEvents(id).Changed`), never a template. Their guards find
the game through the nomination or the phase (`guards/nominations.ts`); player-side rights are
decided in the handlers, since a modal must be the interaction's first answer.

A Storyteller may act for a player who needs a hand, or for an empty seat: pressing Nominate (or
`/nominations nominate`) while unseated opens the same form with an "on behalf of" select first;
the console's Accusation and Defense set the texts with no lock on the accusation for the
Storyteller; and its Write a vote for a seat sets any unlocked ballot line, the seat's own rules
(locked, ghost vote) still applying.

The same moves from the command line (`commands/nominations/`), for people who prefer it:
`/nominations nominate` and `/nominations vote` open the day card's own modals (the nominee or the
nomination from a select, then the text), `accuse` and `defend` take the text or open the card's
modal without it, and `default` says "no" on every open nomination the caller has not voted on.
Each resolves the game by channel, needs the current day open and the caller seated
(`context.ts`), and acts through the cards (`entryContext`), so a submit dispatches as if the
card's button had been pressed.

A backward phase move deletes the phases beyond the target and, by cascade, their nominations;
`teardownPhases` runs first so the cards come down and spent ghost votes return. A passed exile
changes nothing on the seat: the Storyteller handles the traveler in Seating.

## Ending and archiving

`/game end` (a Storyteller's), or the header's End game button that replaces Start once the game
runs, opens an ephemeral pane (`gend`, beside the stack rather than in it): a Good / Evil select, then the seated players in a multi-select with their true roles as
icons. Picking the team fills the players with everyone on that side by true role and alignment
(`games/outcome.ts`); the Storyteller reviews the edge cases, then presses End. End game writes the team to `Game.winner` and
the picked players to `GameWinner` with their role and side frozen as declared, for the record
and for whatever statistics come later. Then it completes the row, tears the stack down,
archives the managed threads and renames the channel `yyyymmdd-<title>` so the archive reads
chronologically. Games
hold no Discord roles, so there is nothing to strip. The channel stays where it is until
`/game archive` (the owner's or a server manager's, once the game has ended) moves it to the top
of the archive category (`games/archive.ts`): the game's queue's archive, else the server's
default. The default is set from `/archives manage`, an ephemeral pane (`archives`, under
`views/archives/`) with one category select, gated on `server.manage`.

`/archives rename <name>` (a Storyteller's, once the game has ended) replaces the placeholder
title with the one the players settled on: the record's `name` and the channel both change, the
channel keeping its `yyyymmdd-` prefix from `endedAt`. Completed games are never deleted from the
database; they are the permanent record that statistics will be built on.

## Tracked roles

Each game keeps a mentionable, permissionless Discord role per logical role, named `<game>
Players` / `Storytellers` / `Kibitzers` (`games/roles.ts`, `GameRole` rows). They are made right
after the channel, granted to every participant then and to each one as they arrive (add, accept,
substitute), revoked as they leave, and deleted when the game ends. Nothing reads them for
authorisation: they exist to be mentioned.

## Reminders

`/reminders new [message] [duration] [offsets]` (a Storyteller's, in a game channel or thread)
sets a timed message in that channel. `duration` is how long from now (`1d13h4m2s`), `offsets`
an optional list of heads-ups before it fires (`4h 2h 1h`), each posted once. A post is a
container: "Reminder for @Players, … <relative time>" over the message quoted; a text display
pings its mentions like raw content does. With a message and a duration the reminder is set on
the spot, pinging the Players; with either missing a pane opens (`greminder`, under
`views/reminders/`): Message and Timing modals, a channel select for where it posts (the game's
channel or any of its threads, a player's ST thread included, checked against the game), a
multi-select of the logical roles to ping, which may be none, then Set reminder. `/reminders list` (`greminders`) shows the game's pending reminders with Cancel.

Reminders are `Reminder` rows; `games/reminders/engine.ts` checks them every 15 seconds from
`onClientReady`, posts whatever is due (the latest of several due at once after downtime, all
recorded in `posted`) and mentions each chosen role through the game's tracked role, or by name
when the game has none. A reminder whose game has ended is retired unposted.

## Whisper semantics (for us, not the card)

- The async count is a subset of the day's whispers; the rest are synchronous. The async stepper
  is capped at the main count, and lowering the main count lowers the async count with it.
- Async whispers need not be committed up front. Any member of an open synchronous whisper may
  ask to promote it (`/whispers promote`, the "retroactive unlim"): the request card goes where
  invitations go, every member must have room for what it will cost them, and when all accept the
  row's `async` flips (`spentOn` counts an async whisper's cost on both counters). In a hybrid game
  a regular player the traveler rule let off now pays in full, on the total too.
- Traveler whispers on: a regular player whispering a traveler spends nothing and only the
  traveler spends one, except that an async whisper in a hybrid game charges both. Off: it costs
  as normal.
- Neighbour whispers on: a whisper between two seated neighbours is free and gets no
  announcement in town. Off: it is announced and counted in the day's total like any other.

## Whispers (`views/whispers/`, `games/whispers/`, `/whispers`)

A whisper is a row in `Whisper` with one `WhisperParticipant` per player, proposed by one of them
and open once every invitee accepts. `/whispers new <player> [async]` and `/whispers group
[async]` (a slash command takes one user per option, so `group` answers with `gwhispergroup`, an
ephemeral user select) post `gwhisper`, the invitation card, where Configuration > Whispers binds
(the `Whispers` thread by default, the game channel when nowhere): "@p is inviting @q, @r to a
whisper", Accept and Decline for the invitees alone. The last yes opens the thread and the card
turns into "@p, @q are whispering" with each one's spent/allowance **as it stood at that moment**
(kept in the card's state, never recomputed) and a Go button that answers the people in it with
a link. A no from anyone ends it and the card says who declined.

**The lifecycle** (`games/whispers/close.ts`, `restrict.ts`). While a synchronous, non-neighbour
whisper is open each member has a member overwrite on the game channel, Send Messages denied and
Send Messages in Threads allowed, so they speak in the whisper and their ST thread and not in
town. `syncTownVoice` is the one writer of that overwrite: it counts the member's open
synchronous whispers they have not ended (`rules.restricts`) and sets or deletes it, and every
transition calls it for the members it touched. `/whispers end` inside the thread ends the
caller's part (`WhisperParticipant.endedAt`); their voice comes back and the card marks them
`ended`, but they keep the thread until the last member ends, when the whisper closes: state
`ended`, the thread locked (not for two seated neighbours under the neighbour rule, whose thread
is their standing channel: `rules.lockOnClose`), the card says they whispered. A Storyteller's
`/whispers end` closes it outright. Landing on a **night** (`gphases`' `moveTo`) and the game's
end close every open whisper and lock every whisper thread of the game, a neighbours' thread left
open by an earlier close included; a pending invitation lapses and its card says so, and no
whisper can be proposed until day. The next whisper between the same people unlocks their thread (`threadFor`), and
with the neighbour rule on, landing on a day reopens every whisper thread between two players now
seated side by side with a fresh free whisper (`reopenNeighbourWhispers`). Whisper threads are
named `Neighbours - Ann and Bob` or `Whisper - Ann, Bob, Cat`; `/whispers rename <title>` from inside
one lets any member retitle it behind that prefix. Bound public threads are never locked: a
locked thread refuses its members' button presses as well as their messages. An
ended whisper still counts against the day. Both cards subscribe to one concrete label,
`whisperChanged(id)` (`views/whispers/events.ts`). The overwrite needs Manage Roles on the game
channel, as the Kibitzers' sight does; a refusal is logged and the whisper runs without the
silence. Substitution moves thread memberships but not whisper rows, so a substituted-in player
inherits no silence. While in a synchronous whisper a player may only end it or ask to promote
it: proposing, accepting, and a neighbour whisper with them are refused (`busyWhispering`), and
the last yes on an invitation is refused while anyone in it is still busy. A synchronous whisper
opened while an async one is running is allowed; the thread is the pair's, so a close never locks
it while another whisper is open in it, and the other side of an async or neighbour whisper
types on as before.

`/whispers neighbour <player>` is the stealthy one: with neighbour whispers on, two seated
neighbours get their thread at once, nothing is posted in town and nothing is spent. `/whispers
list` names the caller's open whispers, oldest first, by thread and company.

Threads are private, in the game channel, kind `whisper`, tagged with the sorted participant set
so the next whisper between the same people reuses the thread; the Storytellers are in every one.
`games/whispers/rules.ts` holds the arithmetic: the day's allowance by mode (sync: the day's
count; async: the async count; hybrid: both, async inside total), the cost of a whisper (one per
other participant; with the traveler rule a regular player pays nothing for travelers, save on a
hybrid game's async whisper; a neighbour whisper is free) and whether a participant can afford one. The initiator is checked
when proposing, each invitee when accepting; a whisper counts against the `on` of the phase it
was made in.

## The member model

Game **members are Participants** (Player, Storyteller, Kibitzer). **Signups are pending
requests** for a role, and nothing more: Accept inserts the Participant and deletes the Signup,
Decline deletes it. Seating is built from the Player participants; there is no consume step.
`docs/interactions/ADR-005-game-membership.md` has the reasoning.
