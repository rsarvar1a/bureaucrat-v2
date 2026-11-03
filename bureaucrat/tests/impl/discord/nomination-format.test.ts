import { test, expect } from 'bun:test';
import {
  BALLOT_BUDGET,
  ballotLines,
  CONSOLE_BUDGET,
  consoleBallot,
  headline,
  quoted,
  statusLine,
  truncate,
  type BallotLineInput,
} from '../../../impl/discord/games/nominations/format';

test('the headline names the kind, and the Storyteller is not named', () => {
  expect(headline('execution', '<@1>', '<@2>')).toBe('<@1> calls for the execution of <@2>.');
  expect(headline('exile', '<@1>', '<@2>')).toBe('<@1> calls for the exile of <@2>.');
  expect(headline('storyteller', '<@1>', null)).toBe('<@1> calls for the execution of the Storyteller.');
});

test('the status line carries the count and the block', () => {
  expect(statusLine('open', 2, 4, false)).toBe('🔄 (2 of 4 votes required)');
  expect(statusLine('passed', 5, 4, true)).toBe('✅ (5 of 4 votes required) · on the block');
  expect(statusLine('failed', 1, 4, false)).toBe('❌ (1 of 4 votes required)');
});

test('a quote is blockquoted line by line, with a placeholder for silence', () => {
  expect(quoted('one\ntwo', '*nothing*')).toBe('> one\n> two');
  expect(quoted(null, '*nothing yet*')).toBe('> *nothing yet*');
});

const line = (position: number, over: Partial<BallotLineInput> = {}): BallotLineInput => ({
  position,
  locked: false,
  yes: null,
  weight: null,
  public: null,
  name: `<@${position}>`,
  state: ':alive:',
  ...over,
});

test('hands are written in order: locked ones with the running count, the next flagged', () => {
  const lines = ballotLines(
    [
      line(1, { locked: true, yes: true, weight: 1, public: 'yes' }),
      line(2, { locked: true, yes: false, weight: 0, public: 'no' }),
      line(3, { locked: true, yes: true, weight: 3 }),
      line(4, { public: 'hmm' }),
      line(5),
    ],
    3,
  );
  expect(lines).toEqual([
    '1. ✅ (1/3) <@1> - "yes"',
    '2. ❌ (1/3) <@2> - "no"',
    '3. ✅ ×3 (4/3) <@3> - *no vote provided*',
    '4. 🕓 :alive: <@4> - "hmm"',
    '5. :alive: <@5> - *no vote provided*',
  ]);
});

test('a Thief weight reads as a negative yes', () => {
  expect(ballotLines([line(1, { locked: true, yes: true, weight: -1, public: 'aye' })], 2)).toEqual([
    '1. ✅ −1 (-1/2) <@1> - "aye"',
  ]);
});

test('the worst ballot shrinks its quotes until it fits the budget', () => {
  const longest = 'x'.repeat(150);
  const votes = Array.from({ length: 20 }, (_, i) =>
    line(i + 1, {
      locked: i % 2 === 0,
      yes: true,
      weight: 1,
      public: longest,
      name: `**${'n'.repeat(32)}** (${'u'.repeat(32)})`,
      state: '<:alive:1234567890123456789>',
    }),
  );
  const ballot = ballotLines(votes, 10);
  expect(ballot.join('\n').length).toBeLessThanOrEqual(BALLOT_BUDGET);
  expect(ballot[0]).toContain('…');

  const body = [
    headline('execution', '<@1>', '<@2>'),
    statusLine('open', 5, 10, false),
    '**Accusation**',
    quoted('a'.repeat(400), ''),
    '**Defense**',
    quoted('d'.repeat(400), ''),
    ...ballot,
  ].join('\n');
  expect(body.length).toBeLessThan(4000);

  // Short votes are left whole.
  expect(ballotLines([line(1, { public: 'aye' })], 1)[0]).toContain('"aye"');
});

test('the console ballot puts each private vote under its hand and fits its budget', () => {
  const votes = [
    { ...line(1, { locked: true, yes: true, weight: 1, public: 'yes' }), private: 'sure' },
    { ...line(2, { public: 'hmm' }), private: null },
  ];
  expect(consoleBallot(votes, 2)).toEqual([
    '1. ✅ (1/2) <@1> - "yes"',
    '-# privately: "sure"',
    '2. 🕓 :alive: <@2> - "hmm"',
    '-# privately: *no vote provided*',
  ]);

  const longest = 'x'.repeat(150);
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...line(i + 1, { public: longest, name: `**${'n'.repeat(32)}** (${'u'.repeat(32)})` }),
    private: longest,
  }));
  expect(consoleBallot(many, 10).join('\n').length).toBeLessThanOrEqual(CONSOLE_BUDGET);
});

test('truncate keeps the cap with an ellipsis', () => {
  expect(truncate('hello', 10)).toBe('hello');
  expect(truncate('hello world', 6)).toBe('hello…');
});
