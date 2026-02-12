import 'dotenv/config';
import { db } from './bureaucrat/utilities/db';

const resp = await db.execute('select now()');
console.log(resp.entries().toArray());