/** What the `/whispers` commands say when all is well. */
export const invited = (where: string) => `Invitation posted in <#${where}>.`;
export const opened = 'Your whisper is open.';
export const none = 'You are in no whispers yet.';
export const ended = 'You have left the whisper; you may speak in town again.';
export const closed = 'The whisper is closed.';
export const renamed = (name: string) => `This thread is now **${name}**.`;
export const neighbourReopened = (day: number) => `Day ${day}: your neighbour whisper is open again.`;
export const promoteAsked = (where: string) => `Asked in <#${where}>; the whisper goes async once everyone accepts.`;
/** Said in the fresh thread the rest of a group whisper moves to when one of them leaves. */
export const continued = (who: string) =>
  `**${who}** left the whisper. It carries on here, at no cost, until you end it.`;
/** Said in the thread as the second-last member leaves and the last is let out with them. */
export const lastLeft = (who: string) => `**${who}** left, so the whisper is over.`;
