import { integer as pgInteger, serial as pgSerial, uuid as pgUuid } from 'drizzle-orm/pg-core';

export const integer = () => pgInteger().primaryKey().generatedAlwaysAsIdentity();

export const serial = () => pgSerial().primaryKey();

export const uuid = () => pgUuid().primaryKey().defaultRandom();
