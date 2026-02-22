/** Expands a type for better tooltip readability (one level deep). */
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

/** Recursively expands a type for better tooltip readability. */
export type ExpandRecursive<T> = T extends infer O
  ? O extends object
    ? { [K in keyof O]: ExpandRecursive<O[K]> }
    : O
  : never;
