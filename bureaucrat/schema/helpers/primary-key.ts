import {
  integer as pgInteger,
  serial as pgSerial,
  uuid as pgUuid,
} from 'drizzle-orm/pg-core';

/**
 *  Creates an integer primary key.
 */
export const integer = () =>
  pgInteger().primaryKey().generatedAlwaysAsIdentity();

/**
 *  Creates an autoincrementing primary key.
 */
export const serial = () => pgSerial().primaryKey();

/**
 *  Creates a UUID primary key.
 */
export const uuid = () => pgUuid().primaryKey().defaultRandom();
