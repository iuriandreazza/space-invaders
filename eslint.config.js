import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const forbidImports = (layers) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: layers.map(({ group, message }) => ({ group, message })),
    },
  ],
});

const clientLayerRules = {
  domain: forbidImports([
    { group: ['react', 'react-dom', 'react-dom/*'], message: 'The game domain must stay framework-free.' },
    { group: ['**/application/**', '**/infrastructure/**', '**/ui/**'], message: 'The domain cannot depend on outer layers.' },
  ]),
  application: forbidImports([
    { group: ['react', 'react-dom', 'react-dom/*'], message: 'The application layer must stay framework-free.' },
    { group: ['**/infrastructure/**', '**/ui/**'], message: 'The application layer depends on ports, not on adapters or UI.' },
  ]),
  infrastructure: forbidImports([
    { group: ['react', 'react-dom', 'react-dom/*'], message: 'Adapters must not depend on React.' },
    { group: ['**/ui/**'], message: 'Adapters cannot depend on the UI layer.' },
  ]),
  ui: forbidImports([
    { group: ['**/infrastructure/**'], message: 'Screens get their adapters from the services the composition root provides.' },
  ]),
};

const serverLayerRules = {
  domain: forbidImports([
    { group: ['hono', 'hono/*', '@hono/*', 'node:*'], message: 'The server domain must stay free of frameworks and I/O.' },
    { group: ['**/application/**', '**/infrastructure/**'], message: 'The domain cannot depend on outer layers.' },
  ]),
  application: forbidImports([
    { group: ['hono', 'hono/*', '@hono/*', 'node:sqlite'], message: 'Use cases depend on ports, not on frameworks or databases.' },
    { group: ['**/infrastructure/**'], message: 'Use cases depend on ports, not on adapters.' },
  ]),
};

export default defineConfig([
  { ignores: ['dist', 'dist-server', 'coverage', 'node_modules', '.claude'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['server/**/*.ts', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  { files: ['shared/game/**/*.ts'], ignores: ['**/*.test.*'], rules: clientLayerRules.domain },
  { files: ['src/application/**/*.{ts,tsx}'], ignores: ['**/*.test.*'], rules: clientLayerRules.application },
  { files: ['src/infrastructure/**/*.{ts,tsx}'], ignores: ['**/*.test.*'], rules: clientLayerRules.infrastructure },
  { files: ['src/ui/**/*.{ts,tsx}'], ignores: ['**/*.test.*'], rules: clientLayerRules.ui },
  { files: ['server/domain/**/*.ts'], ignores: ['**/*.test.*'], rules: serverLayerRules.domain },
  { files: ['server/application/**/*.ts'], ignores: ['**/*.test.*'], rules: serverLayerRules.application },
]);
