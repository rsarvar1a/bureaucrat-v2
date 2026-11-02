import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { stack } from '../../../../../engine/discord/components/stack';
import { accent, text, separator, linear, v2 } from '../../../../../engine/discord/elements';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { GameEvents } from '../events';
import { SIGNUPS_STRIP, type SignupsTab } from '../tabs';

type SignupsState = { tab: SignupsTab };

const strip = stack<SignupsState>()({ route: 'gsignups', field: 'tab', ...SIGNUPS_STRIP });

// Window B that is itself a header: who wants in, who is in, and who takes
// over a seat. Opened as a message of its own only when the root does not
// inline it.
export default createView<SignupsState>()({
  id: 'gsignups',
  idParams: [],
  events: {},
  defaultState: { tab: 'applications' },
  subscribesTo: { render: [GameEvents.Changed], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    return v2(linear(text('### Signups'), separator(), strip.row(view)).setAccentColor(accent.brand));
  },

  interactions: {
    ...strip.interactions,
  },
});
