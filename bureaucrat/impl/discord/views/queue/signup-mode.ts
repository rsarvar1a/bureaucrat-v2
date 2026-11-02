import type { QueueEntry } from '../../../../schema/core/queues.sql';

export type SignupMode = (typeof QueueEntry.$inferSelect)['signups'];
export type SignupRole = 'Player' | 'Storyteller' | 'Kibitzer';

export const SIGNUP_MODES: { value: SignupMode; label: string; description: string }[] = [
  { value: 'open', label: 'Open', description: 'Signups are accepted as they arrive' },
  { value: 'applications', label: 'Applications', description: 'Signups wait until you accept them' },
  { value: 'closed', label: 'Closed', description: 'No signups; seat people yourself once the game exists' },
];

export const modeLabel = (mode: SignupMode) => SIGNUP_MODES.find((m) => m.value === mode)?.label ?? mode;

export const isSignupMode = (value: string): value is SignupMode => SIGNUP_MODES.some((m) => m.value === value);

export const acceptsSignups = (mode: SignupMode) => mode !== 'closed';

// A co-Storyteller is always vetted; nobody shares a grimoire by default.
export const initialAcceptance = (mode: SignupMode, role: SignupRole): true | null =>
  mode === 'open' && role !== 'Storyteller' ? true : null;
