import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import type { Linter } from 'eslint';

const forbid = (groups: string[], message: string): Linter.RulesRecord => ({
  'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }],
});

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: { globals: globals.browser },
  },
  tseslint.configs.recommended,

  {
    files: ['bureaucrat/engine/**/*.ts'],
    rules: forbid(['**/impl/**'], 'engine must not depend on impl - take it as an argument instead.'),
  },
  {
    files: [
      'bureaucrat/utilities/**/*.ts',
      'bureaucrat/schema/**/*.ts',
      'bureaucrat/drizzle/**/*.ts',
      'bureaucrat/strings/**/*.ts',
    ],
    rules: forbid(
      ['**/engine/**', '**/impl/**'],
      'this tier is the bottom of the stack; nothing above it may be used.',
    ),
  },
]);
