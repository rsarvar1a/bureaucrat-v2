import { modal, field } from '../../../../../engine/discord/components/modal';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { NOTE_OF, parseMark, QUESTIONS, type Draft, type Question } from '../../../games/rating';
import { S } from '../../../../../strings';

/**
 * One modal per question: the mark, a single character, and the note under
 * it. The submit writes the pair into the form's draft and the form redraws;
 * nothing reaches the table until Submit.
 */
const questionModal = (q: Question) =>
  modal<Draft>()({
    action: q.key,
    title: q.title,
    fields: {
      mark: field.short(q.question, { description: q.hint, minLength: 1, maxLength: 3, placeholder: '1 to 5' }),
      note: field.paragraph(q.more, { required: false, maxLength: 1000 }),
    },
    async onSubmit(values, interaction, ctx) {
      await interaction.deferUpdate();
      const mark = parseMark(values['mark']);
      if (mark === null) {
        await toast.followUp(interaction, S.errors.badMark, { accent: accent.warning });
        return { action: 'render' as const };
      }
      await ctx.updateState({ [q.key]: mark, [NOTE_OF[q.key]]: values['note'].trim() || null });
      return { action: 'render' as const };
    },
  });

export const questionModals = Object.fromEntries(QUESTIONS.map((q) => [q.key, questionModal(q)])) as Record<
  Question['key'],
  ReturnType<typeof questionModal>
>;

/** What a question's modal opens with: the mark and note already in the draft. */
export const prefill = (draft: Draft, q: Question) => ({
  values: { mark: draft[q.key] === undefined ? '' : String(draft[q.key]), note: draft[NOTE_OF[q.key]] ?? '' },
});
