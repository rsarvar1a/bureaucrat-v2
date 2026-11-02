import { test, expect } from 'bun:test';
import { ComponentType } from 'discord.js';
import { field, modal } from '../../../engine/discord/components/modal';
import type { ViewContext } from '../../../engine/discord/views/types';

type S = { picked: string[] };

const form = modal<S>()({
  action: 'pick',
  title: 'Pick one',
  fields: {
    target: field.select('Who', { placeholder: 'Someone' }),
    note: field.paragraph('Why', { required: false }),
  },
  onSubmit: async (values, _interaction, ctx) => {
    await ctx.updateState({ picked: values.target });
    return { action: 'noop' };
  },
});

// Enough of a context for the component: a custom id and a state to patch.
const context = (): ViewContext<S> & { patched: Partial<S>[] } => {
  const patched: Partial<S>[] = [];
  return {
    patched,
    view: { customId: (action: string) => `view::t::${action}::0` } as unknown as ViewContext<S>['view'],
    action: 'pick',
    ids: {},
    updateState: async (patch) => {
      patched.push(patch);
    },
    notify: async () => {},
    notifyAll: async () => {},
    mutateAndNotify: async () => {},
    spawnView: async () => ({}) as never,
  };
};

test('a select field is built from the options given when the modal is shown', async () => {
  let shown: ReturnType<typeof JSON.parse> | null = null;
  const interaction = {
    showModal: async (m: { toJSON(): unknown }) => {
      shown = m.toJSON();
    },
  };

  await form.show(interaction, context(), {
    options: {
      target: [
        { label: 'Alice', value: 'a' },
        { label: 'Bob', value: 'b' },
      ],
    },
  });

  const labels = shown!.components as { component: { type: number; custom_id: string; options?: unknown[] } }[];
  expect(labels).toHaveLength(2);
  expect(labels[0]!.component.type).toBe(ComponentType.StringSelect);
  expect(labels[0]!.component.custom_id).toBe('target');
  expect(labels[0]!.component.options).toHaveLength(2);
  expect(labels[1]!.component.type).toBe(ComponentType.TextInput);
  expect(shown!.custom_id).toBe('view::t::pick-submit::0');
});

test('the submit reads a select by its values and a text field by its text', async () => {
  const ctx = context();
  const interaction = {
    isModalSubmit: () => true,
    fields: {
      getStringSelectValues: (key: string) => (key === 'target' ? ['b'] : []),
      getTextInputValue: (key: string) => (key === 'note' ? 'because' : ''),
    },
  };

  await form.interactions['pick-submit'](interaction as never, ctx);
  expect(ctx.patched).toEqual([{ picked: ['b'] }]);
});
