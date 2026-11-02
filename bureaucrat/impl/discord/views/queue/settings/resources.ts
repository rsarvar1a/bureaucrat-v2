import { type Nudge, nudges, stepperRow, type Stepper } from '../../../../../engine/discord/components/stepper';
import { text, separator } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { Queue } from '../../../../../schema/core/queues.sql';

type QueueRow = typeof Queue.$inferSelect;

export type Resource = Stepper & { slug: 'conc' | 'per'; column: 'concurrency' | 'entriesPerStoryteller' };

// Declared once and read by the renderer, the guards and the handler, so a
// new cap is one entry rather than a row, a guard key and a case kept in step.
export const RESOURCES: Resource[] = [
  { slug: 'conc', column: 'concurrency', label: 'Concurrent games', min: 1, max: 25, bigStep: 5, unlimited: true },
  {
    slug: 'per',
    column: 'entriesPerStoryteller',
    label: 'Entries per Storyteller',
    min: 1,
    max: 10,
    bigStep: 5,
    unlimited: true,
  },
];

export type BumpAction = `bump:${Resource['slug']}:${Nudge}`;

export const BUMP_ACTIONS = RESOURCES.flatMap((spec) =>
  nudges(spec).map((nudge) => `bump:${spec.slug}:${nudge}` as BumpAction),
);

export const resourceBySlug = (slug: string) => RESOURCES.find((spec) => spec.slug === slug) ?? null;

export const parseBump = (action: string): { spec: Resource; nudge: Nudge } | null => {
  const [verb, slug, nudge] = action.split(':');
  const spec = verb === 'bump' && slug ? resourceBySlug(slug) : null;
  if (!spec || !nudge || !nudges(spec).includes(nudge as Nudge)) return null;
  return { spec, nudge: nudge as Nudge };
};

export const renderResources = <S>(view: ViewRow<S>, queue: QueueRow) => [
  text('### Resources'),
  text('Configure this queue.'),
  separator(),
  ...RESOURCES.map((spec) =>
    stepperRow((action) => view.customId(action as Parameters<typeof view.customId>[0]), spec, queue[spec.column]),
  ),
];
