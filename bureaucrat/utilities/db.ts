import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { poolSize } from './pool';

export const db = drizzle({ client: postgres(process.env.DATABASE_URL!, { max: poolSize() }) });
export type Postgres = typeof db;
