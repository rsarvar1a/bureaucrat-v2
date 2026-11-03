export const created = (reveal: bigint, reactions: bigint): string => `Created <#${reveal}> and <#${reactions}>.`;
export const renamed = (name: string): string => `Renamed the reveal to **${name}**.`;
export const published = 'Enjoy the reveal!';
export const admitted = (thread: bigint): string => `You are now in <#${thread}>.`;
