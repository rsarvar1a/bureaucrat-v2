import { modal, field } from '../../../../engine/discord/components/modal';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import type { ModalSubmitInteraction } from 'discord.js';
import type { ViewContext, ViewInteraction } from '../../../../engine/discord/views/types';
import { getPhase } from '../../../../drizzle/game-phases';
import { getGame } from '../../../../drizzle/games';
import { getNomination, updateNomination, type NominationRow } from '../../../../drizzle/nominations';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { listVotes, setVoteText, type BallotEntry } from '../../../../drizzle/votes';
import { actorOf } from '../../access';
import { nominate, nominateFor } from '../../games/nominations/nominate';
import { isStorytellerOf } from '../../guards/game';
import { isOpen } from '../../games/nominations/open';
import { publish } from '../../games/nominations/publish';
import { mayVote } from '../../games/nominations/rules';
import { nominationChanged } from './events';
import { S } from '../../../../strings';

/** The cards keep no state of their own. */
export type Empty = Record<string, never>;

/** The console's: what the next lock will be, and the custom weight. Declared here so its modals can name it. */
export type ConsoleState = {
  mode?: 'yes' | 'no' | 'bureaucrat' | 'thief' | 'custom';
  weight: number;
  /** The seats picked for the next Lock or Unlock. */
  seats?: string[];
  'confirming:reset'?: boolean;
};

/** The nomination with its game and day, or nothing when any of them is gone. */
export const loadNomination = async (nominationId: string | null | undefined) => {
  const nomination = nominationId ? await getNomination(nominationId) : undefined;
  const [game, phase] = nomination
    ? await Promise.all([getGame(nomination.game), getPhase(nomination.phase)])
    : [undefined, undefined];
  return nomination && game && phase ? { nomination, game, phase } : null;
};

/** The actor's ballot line in a nomination, if they hold a seat in its game. */
export const seatOf = async (interaction: ViewInteraction, nomination: NominationRow) => {
  const actor = actorOf(interaction);
  const me = actor ? await getParticipantByMember(nomination.game, actor.id) : undefined;
  const vote = me ? (await listVotes(nomination.id)).find((v) => v.seat.player === me.id) : undefined;
  return vote ?? null;
};

/** Writes what the player voted, or says why not. */
export const recordVote = async (
  values: { public: string; private: string },
  interaction: ViewInteraction,
  nominationId: string | null | undefined,
): Promise<string | null> => {
  const found = await loadNomination(nominationId);
  const mine = found ? await seatOf(interaction, found.nomination) : null;
  if (!found || !mine) return S.errors.notVoting;
  return writeVote(values, interaction, found, mine);
};

/** Writes a ballot line, whoever is holding the pen: the rules are the seat's, not the writer's. */
export const writeVote = async (
  values: { public: string; private: string },
  interaction: ViewInteraction,
  found: NonNullable<Awaited<ReturnType<typeof loadNomination>>>,
  line: BallotEntry,
): Promise<string | null> => {
  if (!isOpen(found.phase)) return S.errors.nominationsClosed;
  if (line.vote.locked) return S.errors.voteLocked;
  if (!mayVote(found.nomination.kind, line.vote.state)) return S.errors.noGhostVote;

  const row = await setVoteText(line.vote.id, {
    public: values.public.trim() || null,
    private: values.private.trim() || null,
  });
  if (!row) return S.errors.voteLocked;

  await publish(interaction.client, [nominationChanged(found.nomination.id)]);
  return null;
};

const PUBLIC = field.paragraph('Public vote', { required: false, maxLength: 150 });
const PRIVATE = field.paragraph('Private vote (Storytellers only)', { required: false, maxLength: 150 });

// --- The day card's modals -------------------------------------------------

/** Nominate: who, from a select filled when shown, and the accusation. */
export const nominateModal = modal<Empty>()({
  action: 'nominate',
  title: 'Nominate',
  fields: {
    target: field.select('Who do you nominate?', { placeholder: 'Pick a player' }),
    accusation: field.paragraph('Accusation', { required: false, maxLength: 400 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const phase = await getPhase(ctx.view.entityId!);
    const game = phase ? await getGame(phase.game) : undefined;
    if (!phase || !game) return { action: 'render' };

    const result = await nominate(
      interaction.client,
      game,
      phase,
      BigInt(interaction.user.id),
      values['target'][0] ?? '',
      values['accusation'] ?? '',
      interaction,
    );
    if (!result.ok) {
      await toast.followUp(interaction, S.errors.nominationRefused[result.reason] ?? S.errors.notHere, {
        accent: accent.warning,
      });
    }
    return { action: 'render' };
  },
});

/**
 * A Storyteller's nomination on a player's behalf: whose, who, and the
 * accusation. Guarded by the day view as the Storyteller's.
 */
export const proxyNominateModal = modal<Empty>()({
  action: 'proxy',
  title: 'Nominate on behalf of a player',
  fields: {
    accuser: field.select('On behalf of', { placeholder: 'The player nominating' }),
    target: field.select('Who do they nominate?', { placeholder: 'Pick a player' }),
    accusation: field.paragraph('Accusation', { required: false, maxLength: 400 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const phase = await getPhase(ctx.view.entityId!);
    const game = phase ? await getGame(phase.game) : undefined;
    if (!phase || !game) return { action: 'render' };

    const result = await nominateFor(
      interaction.client,
      game,
      phase,
      values['accuser'][0] ?? '',
      values['target'][0] ?? '',
      values['accusation'] ?? '',
      interaction,
    );
    if (!result.ok) {
      await toast.followUp(interaction, S.errors.nominationRefused[result.reason] ?? S.errors.notHere, {
        accent: accent.warning,
      });
    }
    return { action: 'render' };
  },
});

/** Vote from the day card: which nomination, from a select, then the public and private votes. */
export const dayVote = modal<Empty>()({
  action: 'vote',
  title: 'Your vote',
  fields: {
    nomination: field.select('Which nomination?', { placeholder: 'Pick a nomination' }),
    public: PUBLIC,
    private: PRIVATE,
  },
  async onSubmit(values, interaction) {
    await interaction.deferUpdate();
    const refusal = await recordVote(values, interaction, values['nomination'][0]);
    if (refusal) await toast.followUp(interaction, refusal, { accent: accent.warning });
    return { action: 'render' };
  },
});

// --- The nomination card's modals ------------------------------------------

const ACCUSATION = field.paragraph('Your accusation', { required: false, maxLength: 400 });
const DEFENSE = field.paragraph('Your defense', { required: false, maxLength: 400 });

/**
 * The card's Vote, for whoever pressed it: the vote itself, and the text that
 * is theirs to write - the accusation for the accuser while no hand is locked,
 * the defense for the nominee throughout. The vote's refusals stand; the text
 * is saved regardless, since a dead accuser may still accuse.
 */
const submitVote = async (
  values: { public: string; private: string; accusation?: string; defense?: string },
  interaction: ViewInteraction,
  nominationId: string | null | undefined,
): Promise<string | null> => {
  const found = await loadNomination(nominationId);
  const mine = found ? await seatOf(interaction, found.nomination) : null;
  if (!found || !mine) return S.errors.notVoting;

  const patch: { accusation?: string | null; defense?: string | null } = {};
  if (values.accusation !== undefined && mine.seat.id === found.nomination.plaintiff) {
    const locked = (await listVotes(found.nomination.id)).some((v) => v.vote.locked);
    if (!locked) patch.accusation = values.accusation.trim() || null;
  }
  if (values.defense !== undefined && mine.seat.id === found.nomination.defendant) {
    patch.defense = values.defense.trim() || null;
  }
  if (Object.keys(patch).length > 0) {
    await updateNomination(found.nomination.id, patch);
    await publish(interaction.client, [nominationChanged(found.nomination.id)]);
  }

  return writeVote(values, interaction, found, mine);
};

const onVoteSubmit = async (
  values: { public: string; private: string; accusation?: string; defense?: string },
  interaction: ModalSubmitInteraction,
  ctx: ViewContext<Empty>,
) => {
  await interaction.deferUpdate();
  const refusal = await submitVote(values, interaction, ctx.view.entityId);
  if (refusal) await toast.followUp(interaction, refusal, { accent: accent.warning });
  return { action: 'render' as const };
};

/** Vote from the card: the public vote everyone reads, and the private one for the Storytellers. */
export const cardVote = modal<Empty>()({
  action: 'vote',
  title: 'Your vote',
  fields: { public: PUBLIC, private: PRIVATE },
  onSubmit: onVoteSubmit,
});

/** The accuser's Vote, with the accusation to amend while no hand is locked. */
export const accuserVote = modal<Empty>()({
  action: 'avote',
  title: 'Your accusation and vote',
  fields: { accusation: ACCUSATION, public: PUBLIC, private: PRIVATE },
  onSubmit: onVoteSubmit,
});

/** The nominee's Vote, with their defense. */
export const nomineeVote = modal<Empty>()({
  action: 'dvote',
  title: 'Your defense and vote',
  fields: { defense: DEFENSE, public: PUBLIC, private: PRIVATE },
  onSubmit: onVoteSubmit,
});

/** A self-nomination: both texts and the vote. */
export const selfVote = modal<Empty>()({
  action: 'svote',
  title: 'Your accusation, defense and vote',
  fields: { accusation: ACCUSATION, defense: DEFENSE, public: PUBLIC, private: PRIVATE },
  onSubmit: onVoteSubmit,
});

// --- The Storyteller console's modal ----------------------------------------

/**
 * A vote written by the Storyteller for a seat: an empty seat's, or a
 * player's who asked for a hand. The console's guards make it the
 * Storyteller's; the seat's own rules (locked, ghost vote) still apply.
 */
export const proxyVote = modal<ConsoleState>()({
  action: 'proxyvote',
  title: 'Write a vote for a seat',
  fields: {
    seat: field.select('Whose vote?', { placeholder: 'Pick a seat' }),
    public: PUBLIC,
    private: PRIVATE,
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();
    const found = await loadNomination(ctx.view.entityId);
    const line = found ? (await listVotes(found.nomination.id)).find((v) => v.seat.id === values['seat'][0]) : null;
    if (!found || !line) {
      await toast.followUp(interaction, S.errors.notVoting, { accent: accent.warning });
      return { action: 'render' };
    }
    const refusal = await writeVote(values, interaction, found, line);
    if (refusal) await toast.followUp(interaction, refusal, { accent: accent.warning });
    return { action: 'render' };
  },
});

/**
 * The defense and the accusation on their own: the Storyteller's from the
 * console, and the `/nominations defend` and `accuse` commands' through the
 * card, which keeps their submit handlers without a button.
 */
export const defenseModal = modal<ConsoleState | Empty>()({
  action: 'defense',
  title: 'Defense',
  fields: { defense: DEFENSE },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();
    await updateNomination(ctx.view.entityId!, { defense: values['defense']?.trim() || null });
    await publish(interaction.client, [nominationChanged(ctx.view.entityId!)]);
    return { action: 'render' };
  },
});

/** A self-nominator who cannot vote: both texts, nothing else. */
export const selfText = modal<Empty>()({
  action: 'stext',
  title: 'Your accusation and defense',
  fields: { accusation: ACCUSATION, defense: DEFENSE },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();
    const locked = (await listVotes(ctx.view.entityId!)).some((v) => v.vote.locked);
    await updateNomination(ctx.view.entityId!, {
      ...(locked ? {} : { accusation: values['accusation']?.trim() || null }),
      defense: values['defense']?.trim() || null,
    });
    await publish(interaction.client, [nominationChanged(ctx.view.entityId!)]);
    if (locked) await toast.followUp(interaction, S.errors.accusationLocked, { accent: accent.warning });
    return { action: 'render' };
  },
});

export const accusationModal = modal<ConsoleState | Empty>()({
  action: 'accusation',
  title: 'Accusation',
  fields: { accusation: ACCUSATION },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();
    // The accuser is bound once voting begins; a Storyteller, acting for them, is not.
    const found = await loadNomination(ctx.view.entityId);
    const actor = actorOf(interaction);
    const storyteller = found && actor ? await isStorytellerOf(found.game, actor) : false;
    const ballot = await listVotes(ctx.view.entityId!);
    if (!storyteller && ballot.some((v) => v.vote.locked)) {
      await toast.followUp(interaction, S.errors.accusationLocked, { accent: accent.warning });
      return { action: 'render' };
    }
    await updateNomination(ctx.view.entityId!, { accusation: values['accusation']?.trim() || null });
    await publish(interaction.client, [nominationChanged(ctx.view.entityId!)]);
    return { action: 'render' };
  },
});
