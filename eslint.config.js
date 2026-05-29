import compat from 'eslint-plugin-compat';
import config from 'tools-config/eslint';

const reactFreeConfig = config.filter(
  (c) =>
    !c.plugins ||
    (!Object.keys(c.plugins).includes('react') &&
      !Object.keys(c.plugins).includes('react-hooks') &&
      !Object.keys(c.plugins).includes('react-refresh'))
);

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      '*.min.js',
      'babel.config.js',
      'eslint.config.js',
      'vitest.config.ts'
    ]
  },
  ...reactFreeConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      'import-x/no-unresolved': [
        'error',
        {ignore: ['\\.schema$']}
      ]
    }
  },
  {
    ...compat.configs['flat/recommended'],
    files: ['**/*.{ts,tsx,js,jsx}'],
    settings: {
      polyfills: ['Promise']
    }
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      'prettier/prettier': 'error'
    }
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off'
    }
  }
];
