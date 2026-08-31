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
      'vitest.config.mts',
      'vite.config.mts',
      'vite-plugin-haze-css.mts',
      // 工程脚本（size-budget 等构建/CI 辅助，非产品代码；与上面三个
      // 配置脚本同待遇，且规避 node globals 的 no-undef 配置负担）
      'scripts/**',
      // openapi-typescript 生成物（npm run openapi），不参与 lint
      'src/types/openapi.d.ts'
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
      // IntersectionObserver：About Feed 哨兵已做特性检测降级（无 IO
      // 渲染手动 Load more，src/views/About/Feed.tsx），引用处不视为
      // 未支持硬依赖
      polyfills: ['Promise', 'IntersectionObserver']
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
      '@typescript-eslint/require-await': 'off',
      // 占位参数（如签名对齐用的 _ctx）不算未使用
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}
      ]
    }
  }
];
