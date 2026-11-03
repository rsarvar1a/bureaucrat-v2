import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import { accent, text, separator, linear, v2, type ContainerChild } from '../../../../../engine/discord/elements';
import { listGameRatings } from '../../../../../drizzle/game-ratings';
import { getGame } from '../../../../../drizzle/games';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { NOTE_OF, QUESTIONS, stars, summarize } from '../../../games/rating';
import { truncate } from '../../../games/nominations/format';
import { GameEvents } from '../events';
import { S } from '../../../../../strings';

type Empty = Record<string, never>;

const dismiss = dismissButton<Empty>()({ action: 'dismiss' });

/** What the notes may take of the message, after the averages. */
const NOTE_BUDGET = 3000;

/**
 * The Storytellers' ephemeral pane beside the rating card: the average of
 * each mark, then the notes under each question. The notes carry no
 * names, so that what is said is said to the Storytellers rather than in
 * front of them.
 */
export default createView<Empty>()({
  id: 'gratings',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [GameEvents.Changed] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const [game, ratings] = await Promise.all([getGame(view.entityId!), listGameRatings(view.entityId!)]);
    if (!game) return v2(linear(text(S.errors.notHere), separator(), dismiss.row(view)).setAccentColor(accent.neutral));

    const summary = summarize(ratings);
    const averages = QUESTIONS.map(
      (q) => `**${q.title}** ${stars(summary.average[q.key])} ${summary.average[q.key].toFixed(1)}`,
    );

    // The notes, question by question, until the budget runs out.
    const sections: ContainerChild[] = [];
    let used = 0;
    let left = 0;
    for (const q of QUESTIONS) {
      const notes = ratings.flatMap((r) => {
        const note = r[NOTE_OF[q.key]];
        return note ? [`> ${truncate(note, 600).replace(/\n/g, '\n> ')}\n-# a ${r.role}, ${stars(r[q.key])}`] : [];
      });
      if (notes.length === 0) continue;
      const kept: string[] = [];
      for (const note of notes) {
        if (used + note.length + 2 > NOTE_BUDGET) {
          left += 1;
          continue;
        }
        kept.push(note);
        used += note.length + 2;
      }
      if (kept.length > 0) sections.push(separator(), text([`**${q.question}**`, ...kept].join('\n\n')));
    }
    if (left > 0) sections.push(text(`-# …and ${left} more.`));

    return v2(
      linear(
        text(`### Ratings of ${game.name}`),
        text(summary.count === 0 ? S.rating.none : [S.rating.soFar(summary.count), ...averages].join('\n')),
        ...sections,
        separator(),
        dismiss.row(view),
      ).setAccentColor(accent.brand),
    );
  },

  interactions: {
    ...dismiss.interactions,
  },
});
