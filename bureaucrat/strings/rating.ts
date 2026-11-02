export const prompt = 'Rate the game here!';
export const submit = 'Submit rating';
export const seeRatings = 'See ratings';
export const soFar = (count: number): string =>
  count === 0 ? '-# No ratings yet.' : `-# ${count} rating${count === 1 ? '' : 's'} so far.`;
export const formTitle = (game: string): string => `Rate ${game}`;
export const formHint = '-# Answer each question, then Submit. Only the Storytellers see what you write.';
export const thanks = 'Thank you! Your rating has been recorded for the Storytellers.';
export const placed = (thread: bigint): string => `The rating card is up in <#${thread}>.`;
export const none = '*Nobody has rated the game yet.*';
