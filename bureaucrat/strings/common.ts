/**
 * The words the framework itself says.
 *
 * `engine/` is reusable machinery and knows nothing about puzzles or teams, so
 * everything here is generic by construction: a confirmation, a dismissal, the
 * faces on a stepper. They are in this directory anyway, because a bot whose
 * every panel says "Done" except the two that say "Dismiss" has a voice with a
 * seam in it, and finding that seam means grepping the framework.
 *
 * These are defaults. A component that takes a `label` lets the caller say
 * something better for its own panel, and most do.
 */

/** The two halves of a confirmation, in the order they appear. */
export const confirm = 'Confirm';
export const cancel = 'Cancel';

/** What a dismiss button says when its caller does not say otherwise. */
export const dismiss = 'Dismiss';

/**
 * Shown when a guard throws rather than returning a verdict.
 *
 * Deliberately says nothing about what went wrong. The actor cannot act on the
 * difference between a database that blinked and a permission they do not have,
 * and the log already carries the real answer for whoever can.
 */
export const guardFailed = 'Could not verify your permissions for this action.';

/** A stepper's faces: down, up, and the readout for a value with no cap. */
export const stepDown = '−';
export const stepUp = '+';
export const unlimited = '∞';

/** How a stepper reads out: the setting, then where it currently sits. */
export const stepperReadout = (label: string, value: string) => `${label} · ${value}`;

/** The four faces of a control that moves by two magnitudes, by the size of the jump. */
export const nudgeFaces: Record<'downBig' | 'down' | 'up' | 'upBig', string> = {
  downBig: '<<',
  down: '<',
  up: '>',
  upBig: '>>',
};

/**
 * What a command says when it throws.
 *
 * Two of them, differing by one word, because one fires while the command is
 * being routed and the other while it runs. Nobody reading either can act on
 * the difference; they are kept apart only because collapsing them would be a
 * behaviour change disguised as a tidy-up.
 */
export const commandFailedProcessing = 'An error occurred while processing this command.';
export const commandFailedExecuting = 'An error occurred while executing this command.';

/** What an interaction says when its handler throws. */
export const interactionFailed = 'An error occurred while processing this interaction.';
export const viewGone = 'That panel is gone. Open it again.';

/** The bound nominations thread is gone, so the day card went to the game channel. */
export const nominationThreadFellBack =
  'The bound nominations thread could not be found, so nominations opened in the game channel.';

/** `/nominations` command receipts. */
export const accusationSet = 'Your accusation is set.';
export const defenseSet = 'Your defense is set.';
export const voteRecorded = 'Your vote is recorded.';
export const defaulted = (count: number) =>
  count === 0
    ? 'Nothing to default: you have voted on every open nomination.'
    : `Voted "no" on ${count} nomination${count === 1 ? '' : 's'}.`;
