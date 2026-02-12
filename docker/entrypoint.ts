import { $ } from "bun";

await $`bun run db:generate`;
await $`bun run db:migrate`;

await import("../index.ts");
