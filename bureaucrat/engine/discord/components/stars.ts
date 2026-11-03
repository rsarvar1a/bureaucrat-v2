import { ButtonStyle } from 'discord.js';
import { button, buttonRow } from '../elements';
import { S } from '../../../strings';

/**
 * A one-to-five score, nudged by a row of four buttons.
 *
 * Not `stepper.ts`, deliberately. A stepper carries a disabled readout button
 * in its row and its null means "no cap". This is a readout drawn as text
 * above the row rather than inside it, a null meaning "no opinion yet", and a
 * neutral starting point; the only thing the two genuinely share is the clamp.
 *
 * `<<` and `>>` move by three, which on a five-point scale is "take me to the
 * end" from anywhere but the middle. That is the intent: most people know
 * immediately that a puzzle was easy or brutal, and should not have to press
 * four times to say so.
 */
export type StarSpec = {
  /** Short: this rides inside a 100-character customId. */
  slug: string;
  label: string;
  max: number;
};

/** The presses a star row offers, in the order they appear. */
export const NUDGES = [-3, -1, 1, 3] as const;

const GLYPH = { filled: '★', hollow: '☆' } as const;

/** Where an untouched measure nudges from. */
const NEUTRAL = 3;

/** ★★★☆☆, or all hollow for an opinion not yet given. */
export const starBar = (value: number | null, max: number): string =>
  GLYPH.filled.repeat(Math.max(0, Math.min(value ?? 0, max))) +
  GLYPH.hollow.repeat(Math.max(0, max - Math.max(0, Math.min(value ?? 0, max))));

/**
 * Where a nudge lands. Pure, clamped to 1..max, and never wrapping.
 *
 * An untouched measure nudges from the middle rather than from an end, so `>`
 * on a fresh panel reads as "a bit above average" instead of "one star" - and
 * every value on the scale stays reachable in one press from nothing.
 */
export const nudge = (current: number | null, delta: number, max: number): number => {
  const from = current ?? NEUTRAL;

  return Math.max(1, Math.min(max, from + delta));
};

/** The label a nudge wears. */
const face = (delta: number): string =>
  delta === -3
    ? S.common.nudgeFaces.downBig
    : delta === -1
      ? S.common.nudgeFaces.down
      : delta === 1
        ? S.common.nudgeFaces.up
        : S.common.nudgeFaces.upBig;

/**
 * One measure's controls, as a row, ending on `<verb>:<slug>:<delta>`.
 *
 * A button that would not move the score is disabled rather than hidden, the
 * way a clamped stepper's is: the row keeps its shape at both ends of the
 * scale, so the controls do not shuffle under the cursor.
 */
export const starRow = (customId: (action: string) => string, spec: StarSpec, current: number | null, verb = 'rate') =>
  buttonRow(
    ...NUDGES.map((delta) =>
      button(customId(`${verb}:${spec.slug}:${delta}`), face(delta), ButtonStyle.Secondary).setDisabled(
        current !== null && nudge(current, delta, spec.max) === current,
      ),
    ),
  );
