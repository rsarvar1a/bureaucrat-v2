import type { Stepper } from '../../../../../engine/discord/components/stepper';
import type { GameSettings } from '../../../../../schema/core/games.sql';

type Row = typeof GameSettings.$inferSelect;
export type WhisperMode = Row['whisperMode'];

export type WhisperSetting = Stepper & { column: 'whispersPerDay' | 'asyncWhispersPerDay'; modes: WhisperMode[] };

// Declared once and read by the renderer and the '*' handler, so adding a
// setting is one entry rather than a row, a case and a readout kept in step.
export const SETTINGS: WhisperSetting[] = [
  // Below zero is "by the table": the base counts' evil players, Demon included.
  {
    slug: 'wpd',
    column: 'whispersPerDay',
    label: 'Whispers per day',
    min: 0,
    max: 10,
    unlimited: true,
    unlimitedLabel: 'by the table',
    modes: ['sync', 'hybrid'],
  },
  {
    slug: 'async',
    column: 'asyncWhispersPerDay',
    label: 'Of which are async',
    min: 0,
    max: 10,
    modes: ['async', 'hybrid'],
  },
];

export type Toggle = {
  slug: string;
  column: 'groupWhispers' | 'travelerWhispers' | 'neighbourWhispers' | 'preciseWhisperTracking';
  label: string;
  whenTrue: string;
  whenFalse: string;
};

export const TOGGLES: Toggle[] = [
  { slug: 'group', column: 'groupWhispers', label: 'Group whispers', whenTrue: 'allowed', whenFalse: 'off' },
  { slug: 'trav', column: 'travelerWhispers', label: 'Traveler whispers', whenTrue: 'free', whenFalse: 'off' },
  { slug: 'nbr', column: 'neighbourWhispers', label: 'Neighbour whispers', whenTrue: 'free', whenFalse: 'off' },
  { slug: 'precise', column: 'preciseWhisperTracking', label: 'Precise tracking', whenTrue: 'on', whenFalse: 'off' },
];

/** The mode button and the toggles share one row; the settings test holds this at five. */
export const TOGGLE_ROW = TOGGLES.length + 1;

export const MODES: readonly WhisperMode[] = ['sync', 'async', 'hybrid'];

export const MODE_LABEL: Record<WhisperMode, string> = {
  sync: 'Whispers · Synchronous',
  async: 'Whispers · Asynchronous',
  hybrid: 'Whispers · Hybrid',
};

export const nextMode = (mode: WhisperMode): WhisperMode => MODES[(MODES.indexOf(mode) + 1) % MODES.length]!;

export const activeIn = (spec: WhisperSetting, mode: WhisperMode) => spec.modes.includes(mode);

/**
 * Async whispers are a subset of the day's whispers, so the async stepper's
 * ceiling is whatever the main count is; lowering the main count pulls the
 * async count down with it.
 */
export const asyncCap = (whispersPerDay: number) => Math.min(whispersPerDay, SETTINGS[1]!.max);

export const withCap = (spec: WhisperSetting, whispersPerDay: number): WhisperSetting =>
  spec.column === 'asyncWhispersPerDay' ? { ...spec, max: asyncCap(whispersPerDay) } : spec;

/** The count stepper's readout at "by the table" says what the table gives. */
export const withTable = (spec: WhisperSetting, fromTable: number): WhisperSetting =>
  spec.column === 'whispersPerDay' ? { ...spec, unlimitedLabel: `by the table (${fromTable})` } : spec;

export const settingBySlug = (slug: string) => SETTINGS.find((s) => s.slug === slug) ?? null;

export const toggleBySlug = (slug: string) => TOGGLES.find((t) => t.slug === slug) ?? null;

export const toggleLabel = (toggle: Toggle, on: boolean) =>
  `${toggle.label} · ${on ? toggle.whenTrue : toggle.whenFalse}`;

/** The mode row and one row per stepper; the budget test holds this at five. */
export const ROWS = SETTINGS.length + 1;
