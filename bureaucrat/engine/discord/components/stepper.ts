import { ButtonStyle } from 'discord.js';
import { button, buttonRow } from '../elements';
import { S } from '../../../strings';

/**
 * A number that can be nudged by a button.
 *
 * `unlimited` makes the bottom of the range mean "no cap": stepping below `min`
 * yields null and stepping up from null yields `min`. That keeps a nullable
 * setting to three buttons, where a separate toggle would have cost a row.
 *
 * `bigStep` adds a second magnitude and two more buttons, `<<` and `>>`, for a
 * range too wide to walk one press at a time. A row with it wears the four
 * nudge faces rather than `−`/`+`, since a pair of minuses of different sizes
 * reads worse than a pair of chevrons.
 *
 * `toDisplay`/`fromDisplay` let the stored unit differ from the shown one - a
 * byte count edited in megabytes - so the column keeps the unit it wants and
 * the admin reads the unit they think in.
 */
export type Stepper = {
  /** Short: this rides inside a 100-character customId. */
  slug: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  bigStep?: number;
  unlimited?: boolean;
  /** What the readout says at unlimited; `∞` unless a setting means "not decided" instead. */
  unlimitedLabel?: string;
  suffix?: string;
  toDisplay?: (stored: number) => number;
  fromDisplay?: (shown: number) => number;
};

/** The presses a row can offer, in the order they appear. */
export type Nudge = 'downBig' | 'down' | 'up' | 'upBig';

const DIRECTION: Record<Nudge, 1 | -1> = { downBig: -1, down: -1, up: 1, upBig: 1 };

/** Which presses this stepper's row shows. */
export const nudges = (spec: Stepper): Nudge[] =>
  spec.bigStep === undefined ? ['down', 'up'] : ['downBig', 'down', 'up', 'upBig'];

export const shown = (spec: Stepper, stored: number | null): number | null =>
  stored === null ? null : (spec.toDisplay?.(stored) ?? stored);

export const stored = (spec: Stepper, value: number | null): number | null =>
  value === null ? null : (spec.fromDisplay?.(value) ?? value);

/**
 * Applies one press, in display units.
 *
 * Clamps at both ends rather than wrapping: an admin holding `+` should stop at
 * the maximum, not reappear at the minimum having changed the cap to something
 * they did not intend.
 *
 * Unlimited is only one press below the minimum, whatever the size of the
 * press: a big step from the middle of the range lands on `min`, and the next
 * one lifts the cap. Otherwise `<<` would skip straight past the floor.
 */
export const step = (spec: Stepper, current: number | null, direction: 1 | -1, by = spec.step ?? 1): number | null => {
  if (current === null) return direction === 1 ? spec.min : null;

  const next = current + direction * by;

  if (next < spec.min) return current > spec.min ? spec.min : spec.unlimited ? null : spec.min;
  if (next > spec.max) return spec.max;

  return next;
};

/** `step` for a named press, so a handler can go straight from the custom id. */
export const bump = (spec: Stepper, current: number | null, nudge: Nudge): number | null =>
  step(spec, current, DIRECTION[nudge], nudge === 'downBig' || nudge === 'upBig' ? spec.bigStep : undefined);

/** How the current value reads on the button, unlimited included. */
export const label = (spec: Stepper, current: number | null): string =>
  S.common.stepperReadout(
    spec.label,
    current === null ? (spec.unlimitedLabel ?? S.common.unlimited) : `${current}${spec.suffix ?? ''}`,
  );

const face = (spec: Stepper, nudge: Nudge): string => {
  if (spec.bigStep !== undefined) return S.common.nudgeFaces[nudge];
  return nudge === 'down' ? S.common.stepDown : S.common.stepUp;
};

/**
 * One setting, as a row, ending on `bump:<slug>:<nudge>`.
 *
 * The presses first, then the readout. Discord sizes buttons to their labels,
 * so a centred readout of varying width left every row's `+` at a different
 * offset; keeping the controls leftmost puts them in the same place on every
 * row no matter how long the setting is called. A press that would not move
 * the value is disabled rather than hidden, so the row keeps its shape.
 */
export const stepperRow = (
  customId: (action: string) => string,
  spec: Stepper,
  current: number | null,
  options: { disabled?: boolean } = {},
) =>
  buttonRow(
    ...nudges(spec).map((nudge) =>
      button(customId(`bump:${spec.slug}:${nudge}`), face(spec, nudge), ButtonStyle.Secondary).setDisabled(
        options.disabled === true || bump(spec, current, nudge) === current,
      ),
    ),
    button(customId(`bump:${spec.slug}:value`), label(spec, current), ButtonStyle.Secondary).setDisabled(true),
  );
