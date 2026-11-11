import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { stack } from '../../../../engine/discord/components/stack';
import { accent, text, separator, linear, v2 } from '../../../../engine/discord/elements';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { GameEvents } from './events';
import { SETUP_STRIP, type SetupTab } from './tabs';

type SetupState = { tab: SetupTab };

const strip = stack<SetupState>()({ route: 'gsetup', field: 'tab', ...SETUP_STRIP });

// Window B that is itself a header: what the game is played on and how.
// A message of its own beneath the root; its leaves open at C.
export default createView<SetupState>()({
  id: 'gsetup',
  idParams: [],
  events: {},
  defaultState: { tab: 'script' },
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    return v2(linear(text('### Configuration'), separator(), strip.row(view)).setAccentColor(accent.brand));
  },

  interactions: {
    ...strip.interactions,
  },
});
