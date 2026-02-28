import { drizzle } from 'drizzle-orm/postgres-js';

export const db = drizzle(process.env.DATABASE_URL!);
export type Postgres = typeof db;
