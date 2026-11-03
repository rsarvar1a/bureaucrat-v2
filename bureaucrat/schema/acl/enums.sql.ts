import { acl } from './.schema.sql';

export const GrantDecision = acl.enum('GrantDecision', ['allow', 'deny']);
