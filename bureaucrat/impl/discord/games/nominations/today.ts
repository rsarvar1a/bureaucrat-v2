import { listNominationsOfPhase, type NominationRow } from '../../../../drizzle/nominations';
import { listVotes, type BallotEntry } from '../../../../drizzle/votes';
import { STORYTELLER } from './nominate';
import { statusOf } from './rules';

export type OpenNomination = { nomination: NominationRow; ballot: BallotEntry[] };

/** Today's nominations whose count is still open, oldest first, each with its ballot. */
export const openToday = async (phaseId: string): Promise<OpenNomination[]> => {
  const all = await listNominationsOfPhase(phaseId);
  const withBallots = await Promise.all(
    all.map(async (nomination) => ({ nomination, ballot: await listVotes(nomination.id) })),
  );
  return withBallots.filter(
    ({ nomination, ballot }) =>
      statusOf(
        ballot.map((v) => v.vote),
        nomination.required,
        nomination.finalizedAt !== null,
      ) === 'open',
  );
};

/** The latest open nomination against a target: a seat id, or the Storyteller. */
export const openAgainst = (open: OpenNomination[], target: string): OpenNomination | undefined =>
  [...open]
    .reverse()
    .find(({ nomination }) =>
      target === STORYTELLER ? nomination.kind === 'storyteller' : nomination.defendant === target,
    );
