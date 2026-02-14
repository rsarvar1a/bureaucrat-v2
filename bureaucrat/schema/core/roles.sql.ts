import { core } from '.';

/**
 * A Role is a capacity in which a user in the server
 * can interact with a game on Bureaucrat.
 */
export const Role = core.enum('Role', ['Player', 'Storyteller', 'Kibitzer']);
