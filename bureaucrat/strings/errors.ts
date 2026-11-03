/**
 * Every refusal.
 *
 * Gathered because refusals are the rudest thing the bot does and the easiest
 * to get wrong one at a time: the same wall met twice should refuse in the same
 * words, and a member should never have to work out whether they met two walls.
 *
 * Two habits worth keeping when editing:
 *
 * **Name the way out, not the wiring.** "Ask an admin" is useful; "you lack the
 * Maintainer binding" tells whoever is reading how the doorway is built.
 *
 * **Refuse in the same register as the rest of the voice.** These are the
 * lines most likely to drift apologetic or stern relative to everything else,
 * because they get written in a hurry while fixing something else.
 */

/**
 * A record that is not this guild's, and a record that never existed.
 *
 * Deliberately one string for both. A custom id lifted from another server and
 * replayed here should learn nothing about what is over there, so "wrong
 * server" and "gone" have to be indistinguishable from the outside.
 */
export const notHere = 'That no longer exists.';

/** The players' square before the Storytellers' first Publish. */
export const seatingUnpublished = 'The Storytellers have not published the seating yet.';

/** Interactions never happen in DMs, but a stale one can arrive from nowhere. */
export const guildOnly = 'This can only be used inside the server.';

/** The ACL said no. Says nothing about which grant was missing. */
export const noPermission = 'You do not have permission to do this.';

/** Managing a queue entry is the Storyteller's, unless a grant says otherwise. */
export const notStoryteller = 'Only the Storyteller who created this entry can manage it.';
export const notFrontOfQueue = 'Only the Storyteller at the front of the queue can claim a slot.';
export const signupsClosed = 'This entry is not taking signups.';

/** Running a game is its Storytellers', unless a grant says otherwise. */
export const notGameStoryteller = 'Only a Storyteller of this game can do this.';

/** A game command run somewhere that is not a game's channel or thread. */
export const noGameHere = 'This channel does not belong to a game.';

export const gameAlreadyEnded = 'That game has already ended.';
/** A reminder's timing, as `/reminders new` and its pane read it. */
export const badDuration = 'That is not a duration. Write it like `1d13h4m2s`.';
export const notGameChannel = "That channel is not part of this game. Pick the game's channel or one of its threads.";
export const badOffsets = 'Those are not heads-ups. Write them like `4h 2h 1h`, each shorter than the duration.';

export const renameBeforeEnd = 'You can rename this game after it has ended and is ready to be archived.';
export const gameNotRenamed = "Failed to rename the game's channel.";

/** Archiving files a finished game; who may file it is the owner or a server manager. */
export const gameNotEnded = 'End the game before archiving it.';
export const notGameArchiver = 'Only the owner of this game or a server manager can archive it.';
export const noArchive =
  "No archive category is set. A server manager can set one with `/archives manage`, or on the queue's Category tab.";
export const gameAlreadyArchived = 'That game is already in the archive.';
export const gameNotArchived = 'The game could not be moved.';

/** Rebuilding the config menu deletes what is there, so it is the owner's alone. */
export const notGameOwner = 'Only the owner of this game can do this.';

export const noConfigThread = 'This game has no config thread... where did it go?';

/** Provisioning failed; the log has the detail, the member needs the way out. */
export const gameNotCreated = 'Failed to set up the game.';

/** The member-facing side of a game: who is in it and what it plays on. */
export const notInGame = 'You are not part of this game.';
export const alreadyInGame = (role: string) => `You are already in this game as a ${role}.`;
export const nothingToWithdraw = "You haven't signed up for this game.";
export const seatedCannotWithdraw = 'You are seated already and cannot withdraw; ask a Storyteller for help.';
export const storytellerCannotWithdraw = 'Storytellers step down from the Members window, not from here.';
export const alreadySignedUp = 'You have already asked to join this game.';
export const noScript = 'This game has no script yet.';
export const noEntryScript = 'This entry has no script PDF to preview.';
export const pdfNoPages = 'Stored, but no pages could be drawn from it, so there is nothing to preview.';
export const lastStoryteller = 'A game needs at least one Storyteller.';
export const nothingSeated = 'Seat some players before starting.';
export const alreadyStarted = 'This game has already started.';
export const incomingSeated = 'That player already has a seat.';
export const liveInvalid = (reason: string) => `That is not a clocktower.live game state: ${reason}`;
export const liveNothingGiven = 'Attach the game state as a file, or paste it in the box.';

/** Why a whisper cannot be proposed, by the rule it broke. */
export const whisperRefused: Record<
  | 'not-running'
  | 'not-player'
  | 'invitee-not-player'
  | 'self'
  | 'no-group'
  | 'no-async'
  | 'no-neighbour'
  | 'not-neighbours'
  | 'over-budget'
  | 'in-whisper'
  | 'other-in-whisper'
  | 'night',
  string
> = {
  'not-running': 'Whispers open once the game starts.',
  'not-player': 'Only players may whisper here.',
  'invitee-not-player': 'You may only invite other players to whisper.',
  self: 'You cannot whisper with yourself!',
  'no-group': 'The Storytellers have not allowed group whispers.',
  'no-async': 'This game has no asynchronous whispers.',
  'no-neighbour': 'The Storytellers have not allowed neighbour whispers.',
  'not-neighbours': 'You can only open a neighbour whisper with your seated neighbour.',
  'over-budget': 'You have used up your whispers for today.',
  'in-whisper': 'You are in a whisper now; end it or ask to make it async first.',
  'other-in-whisper': 'Your neighbour is in a whisper now; wait until they have ended it.',
  night: 'It is night; whispers wait for day.',
};

/** Why an answer to an invitation did not take. */
export const whisperAnswer: Record<'not-invited' | 'answered' | 'closed' | 'over-budget' | 'in-whisper', string> = {
  'not-invited': 'You cannot accept this whisper!',
  answered: 'You have already answered.',
  closed: 'This whisper is no longer waiting on anyone.',
  'over-budget': 'You have used up your whispers for today.',
  'in-whisper': 'You are in a whisper now; end it or ask to make it async before you accept another.',
};
export const whisperAnswerBusy = (name: string) =>
  `**${name}** is in a whisper now; your yes would open this one, so wait until they have ended theirs.`;
export const whisperNotInvited = whisperAnswer['not-invited'];
export const whisperNotYours = 'You are not in this whisper.';

/** Why `/whispers end` did nothing. */
export const whisperEnd: Record<'not-in-thread' | 'not-open' | 'not-member' | 'already-ended', string> = {
  'not-in-thread': 'Run this inside the whisper you want to end.',
  'not-open': 'This whisper is already closed.',
  'not-member': whisperNotYours,
  'already-ended': 'You have already left this whisper.',
};

export const whisperRenameNotHere = 'Run this inside the whisper thread you want to rename.';

/** Why a promotion to async could not be asked for. */
export const whisperPromote: Record<
  'not-in-thread' | 'not-open' | 'not-member' | 'async' | 'free' | 'no-async' | 'promoting',
  string
> = {
  'not-in-thread': 'Run this inside the whisper you want to make async.',
  'not-open': 'This whisper is already closed.',
  'not-member': whisperNotYours,
  async: 'This whisper is async already.',
  free: 'A neighbour whisper has no need of it.',
  'no-async': 'This game has no asynchronous whispers.',
  promoting: 'A request is already waiting on an answer.',
};
export const whisperPromoteBudget = (names: string[]) =>
  `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} no async whisper left today.`;

/** Why an answer to a promotion request did not take. */
export const whisperPromoteAnswer: Record<'not-member' | 'answered' | 'closed' | 'over-budget', string> = {
  'not-member': whisperNotYours,
  answered: 'You have already answered.',
  closed: 'This request is no longer waiting on anyone.',
  'over-budget': 'You have no async whisper left today.',
};

/** Uploads are checked before they are read; the modal's own filter is advisory. */
export const uploadTooLarge = (limit: string) => `That file is too large; the limit is ${limit}.`;
export const uploadWrongType = (kind: string) => `That file is not a ${kind}.`;
export const uploadUnreachable = 'The file could not be downloaded from Discord. Try again.';
export const scriptInvalid = (reason: string) => `That script could not be read: ${reason}`;
export const nightsInvalid = (reason: string) => `That night order could not be read: ${reason}`;

/** Why a nomination, a vote or a lock was refused. */
export const nominationRefused: Record<string, string> = {
  notSeated: 'Only seated players may nominate.',
  notAlive: 'Only living players may nominate.',
  alreadyNominated: 'You have already nominated today.',
  alreadyNominee: 'That player has already been nominated today.',
  storytellerOff: 'The Storyteller cannot be nominated in this game.',
  closed: 'Nominations are closed.',
  badTarget: 'That player is not seated.',
  noChannel: 'There is nowhere to post the nomination.',
};
export const nominationsClosed = nominationRefused['closed']!;
export const notVoting = 'You have no vote in this nomination.';
export const voteLocked = 'That vote has been locked.';
export const noGhostVote = 'You have no vote left: your ghost vote is spent.';
export const notDefendant = 'Only the nominee may set the defense.';
export const notPlaintiff = 'Only the accuser may edit the accusation.';
export const accusationLocked = 'The accusation is fixed once voting has begun.';
export const nothingToLock = 'Pick the seats first.';
export const everyHandLocked = 'Every vote is locked.';
export const handsUp = 'Every vote must be locked before the count is finalized.';
export const alreadyFinal = 'This count is already finalized.';
export const nominationGone = 'That nomination is gone.';
export const notNominatedToday = 'You have no open nomination today.';
export const notNomineeToday = 'Nobody has nominated you today.';
export const nothingOpenToVote = 'There is no open nomination to vote on.';
export const revealExists = 'This game already has a reveal; rename it with /reveal rename.';
export const noReveal = 'This game has no reveal yet.';
export const badMark = 'A mark is a whole number from 1 to 5.';

/** The offsite archive: the second server an ended game is copied into. */
export const noOffsite = 'This server has no archive server set. A manager sets one with `/archives offsite`.';
export const offsiteSourceGone = "The game's channel could not be found.";
export const offsiteNotReachable = (missing: string[]): string =>
  missing.length === 0
    ? 'The archive server or its category could not be reached. Is the bot in it?'
    : `In the archive server the bot is missing: ${missing.join(', ')}.`;
export const exportRunning = 'This game is being archived already. Its card says how far along it is.';
export const exportDone = 'This game has already been copied. Run it again with `fresh` to start over.';
export const nothingExported = 'This game has not been exported yet.';
export const storytellersDoNotRate = 'The ratings are for you, Storyteller; the players give them.';
export const ratingThreadGone = 'The reveal thread could not be reached.';
export const revealNotCreated = 'The reveal threads could not be created.';
export const notAdmitted = 'Could not add you to that thread.';
export const noSuchThread = 'That thread does not exist; nothing is shown there.';
export const notLatestNomination = 'Only the latest nomination of the day can be reset.';
export const nobodyToNominate = 'There is nobody left to nominate today.';
export const nobodyToNominateFor = 'No living player is seated to nominate on behalf of.';
