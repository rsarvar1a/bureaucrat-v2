import { test, expect } from 'bun:test';
import {
  SIGNUP_MODES,
  acceptsSignups,
  initialAcceptance,
  isSignupMode,
  modeLabel,
} from '../../../impl/discord/views/queue/signup-mode';

test('open accepts players and kibitzers on arrival, never a co-Storyteller', () => {
  expect(initialAcceptance('open', 'Player')).toBe(true);
  expect(initialAcceptance('open', 'Kibitzer')).toBe(true);
  expect(initialAcceptance('open', 'Storyteller')).toBeNull();
});

test('applications hold everyone for vetting', () => {
  expect(initialAcceptance('applications', 'Player')).toBeNull();
  expect(initialAcceptance('applications', 'Storyteller')).toBeNull();
});

test('only closed refuses a signup', () => {
  expect(acceptsSignups('open')).toBe(true);
  expect(acceptsSignups('applications')).toBe(true);
  expect(acceptsSignups('closed')).toBe(false);
});

test('every mode has a distinct label and round-trips through the select', () => {
  expect(new Set(SIGNUP_MODES.map((m) => m.label)).size).toBe(SIGNUP_MODES.length);
  for (const mode of SIGNUP_MODES) {
    expect(isSignupMode(mode.value)).toBe(true);
    expect(modeLabel(mode.value)).toBe(mode.label);
  }
  expect(isSignupMode('public')).toBe(false);
});
