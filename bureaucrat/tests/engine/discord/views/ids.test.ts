import { test, expect } from 'bun:test';
import { mergeAncestryIds } from '../../../../engine/discord/views/ids';

test('each link maps its route to its entity, or its own id without one', () => {
  expect(
    mergeAncestryIds([
      { route: 'queue', entityId: 'q1', id: 'v1', ids: null },
      { route: 'qentry', entityId: null, id: 'v2', ids: null },
    ]),
  ).toEqual({ queue: 'q1', qentry: 'v2' });
});

test('a closer link overrides a farther one, and spawn ids override the route', () => {
  expect(
    mergeAncestryIds([
      { route: 'gconfig', entityId: 'g1', id: 'v1', ids: null },
      { route: 'gconfig', entityId: 'g2', id: 'v2', ids: null },
      { route: 'gsignup', entityId: 'g2', id: 'v3', ids: { gconfig: 'g9', extra: 'x' } },
    ]),
  ).toEqual({ gconfig: 'g9', gsignup: 'g2', extra: 'x' });
});

test('ids a command named at spawn survive with no ancestors at all', () => {
  expect(mergeAncestryIds([{ route: 'gsignup', entityId: 'g1', id: 'v1', ids: { gconfig: 'g1' } }])).toEqual({
    gsignup: 'g1',
    gconfig: 'g1',
  });
});
