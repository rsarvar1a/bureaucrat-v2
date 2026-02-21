import { $ } from 'bun';

try {
  await $`bun run db:generate`;
  await $`bun run db:migrate`;
} catch (e) {
  console.error('Error during database setup:', e);
}

await import('../index.ts');
