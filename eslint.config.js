import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  { files: ['site/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['test/**/*.js', 'scripts/**/*.mjs', '*.js'], languageOptions: { globals: globals.node } },
];
