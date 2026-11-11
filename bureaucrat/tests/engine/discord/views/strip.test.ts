import { test, expect } from 'bun:test';
import { ButtonStyle, ComponentType } from 'discord.js';
import { stripControls } from '../../../../engine/discord/views/strip';

const text = (content: string) => ({ type: ComponentType.TextDisplay, content });
const button = (style = ButtonStyle.Primary) =>
  style === ButtonStyle.Link
    ? { type: ComponentType.Button, style, url: 'https://example.com', label: 'Go' }
    : { type: ComponentType.Button, style, custom_id: 'view::x::y', label: 'Press' };
const row = (...components: unknown[]) => ({ type: ComponentType.ActionRow, components });

test('rows of controls go, rows of links stay with only the links', () => {
  expect(
    stripControls([
      text('a'),
      row(button(), { type: ComponentType.StringSelect, custom_id: 's', options: [] }),
      row(button(), button(ButtonStyle.Link)),
    ]),
  ).toEqual([text('a'), row(button(ButtonStyle.Link))]);
});

test('a container keeps its text and loses its controls', () => {
  const separator = { type: ComponentType.Separator };
  expect(
    stripControls([
      { type: ComponentType.Container, accent_color: 1, components: [text('a'), separator, row(button())] },
    ]),
  ).toEqual([{ type: ComponentType.Container, accent_color: 1, components: [text('a'), separator] }]);
});

test('a container left empty goes too', () => {
  expect(stripControls([text('a'), { type: ComponentType.Container, components: [row(button())] }])).toEqual([
    text('a'),
  ]);
});

test('a section gives way to its text when its accessory was a control, and stays otherwise', () => {
  const linked = { type: ComponentType.Section, components: [text('b')], accessory: button(ButtonStyle.Link) };
  const thumbed = {
    type: ComponentType.Section,
    components: [text('c')],
    accessory: { type: ComponentType.Thumbnail, media: { url: 'x' } },
  };
  expect(
    stripControls([
      {
        type: ComponentType.Container,
        components: [{ type: ComponentType.Section, components: [text('a')], accessory: button() }],
      },
      linked,
      thumbed,
    ]),
  ).toEqual([{ type: ComponentType.Container, components: [text('a')] }, linked, thumbed]);
});

test('a message of controls alone strips to nothing', () => {
  expect(stripControls([row(button())])).toEqual([]);
});
