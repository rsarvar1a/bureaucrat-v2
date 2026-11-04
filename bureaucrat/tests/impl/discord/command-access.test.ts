import { test, expect } from 'bun:test';
import { commandAccess } from '../../../impl/discord/guards/command-access';
import { Permissions } from '../../../impl/acl/permissions';

test('everything under admin needs server.manage by virtue of living there', () => {
  for (const path of ['admin', 'admin::sync', 'admin::emoji', 'admin::something-nobody-has-written-yet']) {
    expect(commandAccess(path), path).toBe(Permissions.Server.Manage);
  }
});

test('admin::sync is gated, which it was not before', () => {
  // It had no check at all, so anyone could re-publish the command forest into
  // any guild id they liked. Pinned so the hole cannot reopen the next time
  // somebody adds a command.
  expect(commandAccess('admin::sync')).toBe(Permissions.Server.Manage);
});

test('everything under settings needs server.permissions', () => {
  for (const path of ['settings', 'settings::permissions', 'settings::anything']) {
    expect(commandAccess(path), path).toBe(Permissions.Server.Permissions);
  }
});

test('creating a queue posts server furniture and needs queue.create', () => {
  expect(commandAccess('queues::new')).toBe(Permissions.Queue.Create);
});

test('reading commands are open', () => {
  for (const path of ['queues', 'queues::list', 'my', 'my::entries', 'my::signups', 'my::kibitz']) {
    expect(commandAccess(path), path).toBe('open');
  }
});

test('an unknown command defaults to open rather than to a permission', () => {
  // The ACL is closed by default: no grant means deny. A default of "some
  // permission" would therefore lock everyone out of a command nobody has
  // thought to map, which is the wrong failure for a read.
  expect(commandAccess('something::unmapped')).toBe('open');
});

test("the server's default archive is server furniture and needs server.manage", () => {
  expect(commandAccess('archives::manage')).toBe(Permissions.Server.Manage);
  expect(commandAccess('archives::reflow')).toBe(Permissions.Server.Manage);
  expect(commandAccess('archives::offsite::config')).toBe(Permissions.Server.Manage);
  expect(commandAccess('archives::offsite::copy')).toBe(Permissions.Server.Manage);
  expect(commandAccess('archives::offsite::reflow')).toBe(Permissions.Server.Manage);
});

test('archiving a game is open here and decided by ownership or server.manage in the handler', () => {
  expect(commandAccess('game::archive')).toBe('open');
});

test('renaming an ended game is open here and decided by who storytold it', () => {
  expect(commandAccess('archives::rename')).toBe('open');
});

test('creating a game by hand bypasses the queue and needs game.create', () => {
  expect(commandAccess('game::new')).toBe(Permissions.Game.Create);
});

test('ending a game is open here, because who may end it is a question for the handler', () => {
  // The path gate can only name a permission; "a Storyteller of this game" is
  // decided against the game the command is run in.
  expect(commandAccess('game::end')).toBe('open');
});

test('rebuilding a config menu is open here and decided by game ownership in the handler', () => {
  expect(commandAccess('game::config')).toBe('open');
});

test("a player's game commands are open here, because the channel decides", () => {
  // /game script and /signups signup are run inside a game's channel by people
  // who are not Storytellers; the handler resolves the game and refuses outsiders.
  for (const path of [
    'game::script',
    'signups::signup',
    'signups::withdraw',
    'signups::list',
    'game::seating',
    'game::rate',
    'game::export',
    'game::offsite',
    'whispers::list',
    'whispers::new',
    'whispers::group',
    'whispers::neighbour',
    'whispers::end',
    'whispers::promote',
    'whispers::rename',
    'reminders::new',
    'reminders::list',
    'nominations::nominate',
    'nominations::accuse',
    'nominations::defend',
    'nominations::vote',
    'nominations::default',
    'reveal::new',
    'reveal::rename',
    'reveal::publish',
    'reveal::read',
    'reveal::react',
  ]) {
    expect(commandAccess(path), path).toBe('open');
  }
});
