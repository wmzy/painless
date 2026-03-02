const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const importPlugin = require('eslint-plugin-import');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');
const compat = require('eslint-plugin-compat');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        document: 'readonly',
        window: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
      prettier: prettierPlugin,
      compat,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'no-unused-vars': 'off',
      'react/jsx-props-no-spreading': 'off',
      'react/no-unknown-property': ['error', { ignore: ['x-class', 'x-if', 'x-elseif', 'x-else'] }],
      'no-return-assign': ['error', 'except-parens'],
      'no-sequences': 'off',
      'no-shadow': 'off',
      'no-plusplus': 'off',
      'no-param-reassign': 'off',
      'no-void': 'off',
      'react/require-default-props': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-use-before-define': ['error', {functions: false}],
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {},
      },
      polyfills: ['Promise'],
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        browser: true,
        node: true,
        __DEV__: true,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
    },
  },
  {
    ignores: ['dist', 'node_modules', 'coverage', '*.min.js'],
  },
];
