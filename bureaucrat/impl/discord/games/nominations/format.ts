import { tally, weightLabel, type NominationKind, type Status } from './rules';

export const STATUS_MARK: Record<Status, string> = { open: '🔄', passed: '✅', failed: '❌' };

/** Prepended to the hand the Storyteller locks next. */
export const NEXT_MARK = '🕓';

export const NO_VOTE = '*no vote provided*';

/** `p calls for the execution of q.`, or of the Storyteller, who is not named. */
export const headline = (kind: NominationKind, accuser: string, nominee: string | null): string =>
  kind === 'storyteller'
    ? `${accuser} calls for the execution of the Storyteller.`
    : `${accuser} calls for the ${kind} of ${nominee ?? 'the empty seat'}.`;

export const statusLine = (status: Status, votes: number, required: number, onBlock: boolean): string =>
  `${STATUS_MARK[status]} (${votes} of ${required} votes required)${onBlock ? ' · on the block' : ''}`;

/** A quoted block, line by line, or a placeholder when nothing was written. */
export const quoted = (text: string | null | undefined, placeholder: string): string =>
  text
    ? text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    : `> ${placeholder}`;

export const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;

export type BallotLineInput = {
  position: number;
  locked: boolean;
  yes: boolean | null;
  weight: number | null;
  public: string | null;
  /** The voter as named for this channel. */
  name: string;
  /** The seat's state emote (or word), shown while the hand is up. */
  state: string;
};

/** The budget the ballot has in a card: the message holds 4000, the headline, status and two quotes take the rest. */
export const BALLOT_BUDGET = 2_800;

/** The caps the ballot tries for each quoted vote, longest first, until it fits its budget. */
const TEXT_CAPS = [150, 100, 60, 30, 12];

/** A hand still up: `n. 🕓 <state> name — "text"`, the clock only on the one to lock next. */
export const handLine = (
  v: Pick<BallotLineInput, 'position' | 'state' | 'name' | 'public'>,
  next: boolean,
  cap = TEXT_CAPS[0]!,
): string => {
  const said = v.public ? `"${truncate(v.public, cap)}"` : NO_VOTE;
  return `${v.position}. ${next ? `${NEXT_MARK} ` : ''}${v.state} ${v.name} - ${said}`;
};

const lines = (votes: BallotLineInput[], required: number, cap: number): string[] => {
  const ordered = [...votes].sort((a, b) => a.position - b.position);
  const next = ordered.find((v) => !v.locked)?.position ?? null;
  return ordered.map((v) => {
    if (!v.locked) return handLine(v, v.position === next, cap);
    const said = v.public ? `"${truncate(v.public, cap)}"` : NO_VOTE;
    const running = tally(ordered.filter((o) => o.position <= v.position));
    const mark = v.yes ? `✅${v.weight !== 1 ? ` ${weightLabel(v.weight)}` : ''}` : '❌';
    return `${v.position}. ${mark} (${running}/${required}) ${v.name} - ${said}`;
  });
};

/**
 * One line per hand, in voting order, the number first so Discord renders a
 * real list. Unlocked: `n. <state> name — "text"`, the next to lock flagged
 * with 🕓 after its number; locked: `n. ✅|❌ (x/y) name — "text"`, where
 * `x` is the count once this hand is in and the weight is written when it is
 * not one. Long votes are cut shorter and shorter until the whole ballot fits
 * its budget, so twenty talkative players cannot push the card past what a
 * message holds.
 */
export const ballotLines = (votes: BallotLineInput[], required: number, budget = BALLOT_BUDGET): string[] => {
  let last: string[] = [];
  for (const cap of TEXT_CAPS) {
    last = lines(votes, required, cap);
    if (last.join('\n').length <= budget) return last;
  }
  return last;
};

/** The console's ballot has the message nearly to itself: headline, status and the rows take the rest. */
export const CONSOLE_BUDGET = 3_400;

/** The `-# privately: …` line under a hand, for the Storytellers' eyes. */
export const privateLine = (text: string | null, cap = TEXT_CAPS[0]!): string =>
  `-# privately: ${text ? `"${truncate(text, cap)}"` : NO_VOTE}`;

/**
 * The card's ballot with each hand's private vote under it, for the console.
 * Both texts shrink together until the whole fits.
 */
export const consoleBallot = (
  votes: (BallotLineInput & { private: string | null })[],
  required: number,
  budget = CONSOLE_BUDGET,
): string[] => {
  const ordered = [...votes].sort((a, b) => a.position - b.position);
  let last: string[] = [];
  for (const cap of TEXT_CAPS) {
    const publicLines = lines(ordered, required, cap);
    last = ordered.flatMap((v, i) => [publicLines[i]!, privateLine(v.private, cap)]);
    if (last.join('\n').length <= budget) return last;
  }
  return last;
};
