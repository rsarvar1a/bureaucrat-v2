import type { Client } from 'discord.js';

export default async function onClientReady(client: Client) {
  console.log(`Logged in as ${client.user?.tag}!`);
}
