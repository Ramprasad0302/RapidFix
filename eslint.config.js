import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/generated/**', '**/coverage/**', 'build/**', 'android/**', 'android-app/**', 'ios-app/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['backend/**/*.ts', 'scripts/**/*.mjs', 'backend/prisma/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/web/public/config.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
);
