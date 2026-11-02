import type { Leaf, StackTab, Strip } from '../../../../engine/discord/components/stack';

export type ConfigTab = 'setup' | 'seating' | 'messaging' | 'phases' | 'signups';
export type SetupTab = 'script' | 'threads' | 'whispers' | 'nominations' | 'seating';
export type SignupsTab = 'applications' | 'members' | 'substitute';

export const SETUP_TABS: Leaf<SetupTab>[] = [
  { key: 'nominations', label: 'Nominations', window: 'gnominations' },
  { key: 'script', label: 'Script', window: 'gscript' },
  { key: 'seating', label: 'Seating', window: 'gseatingconfig' },
  { key: 'threads', label: 'Threads', window: 'gthreadplan' },
  { key: 'whispers', label: 'Whispers', window: 'gwhispers' },
];

export const SIGNUPS_TABS: Leaf<SignupsTab>[] = [
  { key: 'applications', label: 'Applications', window: 'gapplications' },
  { key: 'members', label: 'Members', window: 'gmembers' },
  { key: 'substitute', label: 'Substitute', window: 'gsubstitute' },
];

// Each nested strip is declared once, as a `Strip`, so it can serve either
// as the header it is (`gsetup`, `gsignups`, a message of its own) or be
// inlined into the root with `inline: SETUP_STRIP`. Neither is inlined today:
// the root keeps the navigation and the game-state action, the nested header
// its own navigation, and the content beneath both.
export const SETUP_STRIP: Strip<SetupTab> = { tabs: SETUP_TABS, fallback: 'script' };
export const SIGNUPS_STRIP: Strip<SignupsTab> = { tabs: SIGNUPS_TABS, fallback: 'applications' };

export const CONFIG_TABS: StackTab<ConfigTab>[] = [
  { key: 'setup', label: 'Configuration', window: 'gsetup' },
  { key: 'messaging', label: 'Messaging', window: 'gmessaging' },
  { key: 'phases', label: 'Phases', window: 'gphases' },
  { key: 'seating', label: 'Seating', window: 'gseating' },
  { key: 'signups', label: 'Signups', window: 'gsignups' },
];

/** Every action each window dispatches besides its strip, for the custom-id length test. */
export const ACTIONS: Record<string, readonly string[]> = {
  gconfig: ['start', 'start-confirm', 'start-cancel', 'end'],
  gsetup: [],
  gthreadplan: ['add', 'add-submit', 'select', 'rename', 'rename-submit', 'delete'],
  gscript: [
    'thread',
    'details',
    'details-submit',
    'kind',
    'upload',
    'json-submit',
    'nights-submit',
    'pdf-submit',
    'remove',
    'preview',
  ],
  gscriptpreview: ['first', 'back', 'readout', 'next', 'last', 'dismiss'],
  gscriptcard: ['preview', 'dismiss'],
  gseatroles: [
    'true-pick',
    'true-prev',
    'true-page',
    'true-next',
    'apparent-pick',
    'apparent-prev',
    'apparent-page',
    'apparent-next',
    'true-align',
    'apparent-align',
    'custom',
    'custom-submit',
    'traveler',
    'dismiss',
  ],
  gsignup: ['role', 'message-submit', 'withdraw', 'dismiss'],
  gseating: [
    'seat-all',
    'add',
    'add-empty',
    'add-pick',
    'select',
    'roles',
    'state',
    'nickname',
    'nick-form-submit',
    'move',
    'move-to',
    'swap',
    'swap-with',
    'associate',
    'associate-pick',
    'remove',
    'cancel',
    'publish',
    'live',
    'live-submit',
  ],
  gseatlive: ['pick:0', 'pick:19', 'prev', 'page', 'next', 'apply', 'dismiss'],
  gnominations: ['toggle:st', 'thread', 'after', 'after-submit'],
  gseatingconfig: ['thread', 'expose', 'live'],
  gtownsquare: ['details'],
  gmessaging: ['announce', 'announce-submit', 'broadcast', 'broadcast-submit'],
  gsignups: [],
  gapplications: [
    'filter',
    'select',
    'accept',
    'decline',
    'bump:pc:downBig',
    'bump:pc:down',
    'bump:pc:up',
    'bump:pc:upBig',
    'bump:pc:value',
  ],
  gmembers: [
    'role-Player',
    'role-Storyteller',
    'role-Kibitzer',
    'add',
    'select',
    'remove',
    'remove-confirm',
    'remove-cancel',
    'peek',
  ],
  gpeek: ['dismiss'],
  grating: ['rate', 'ratings'],
  gratingform: [
    'script',
    'script-submit',
    'decisions',
    'decisions-submit',
    'atmosphere',
    'atmosphere-submit',
    'overall',
    'overall-submit',
    'submit',
    'dismiss',
  ],
  gratings: ['dismiss'],
  goffsite: ['retry'],
  gsubstitute: ['out', 'in', 'substitute', 'substitute-confirm', 'substitute-cancel'],
  gphases: ['scope', 'day-back', 'back', 'now', 'next', 'day-forward', 'jump', 'nominations'],
  // The nomination cards and the console live outside the stack but dispatch the same way.
  gnomday: ['nominate', 'nominate-submit', 'proxy-submit', 'vote-submit', 'manage'],
  gnomblock: ['block', 'dismiss'],
  gnomination: [
    'vote',
    'vote-submit',
    'avote-submit',
    'stext-submit',
    'dvote-submit',
    'svote-submit',
    'defense-submit',
    'accusation-submit',
    'manage',
  ],
  gnomst: [
    'write',
    'proxyvote-submit',
    'accusation',
    'accusation-submit',
    'defense',
    'defense-submit',
    'seats',
    'lock',
    'unlock',
    'lock-rest',
    'finalize',
    'reset',
    'reset-confirm',
    'reset-cancel',
    'dismiss',
    'mode',
    'bump:w:downBig',
    'bump:w:down',
    'bump:w:up',
    'bump:w:upBig',
    'bump:w:value',
  ],
};
