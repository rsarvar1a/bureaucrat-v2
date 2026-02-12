
import * as pg from 'drizzle-orm/pg-core';

export const meta = pg.pgTable('meta', {
    id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
    name: pg.text(),
    script_id: pg.text(),
    author: pg.text(),
});