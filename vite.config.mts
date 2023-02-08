/* eslint-disable import/no-extraneous-dependencies */

import * as path from 'path';
import {defineConfig, PluginOption} from 'vite';
import react from '@vitejs/plugin-react';
import linaria from '@linaria/rollup';
import typeAsJsonSchema from 'rollup-plugin-type-as-json-schema';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: `${path.join(__dirname, 'src/$1')}`
      }
    ]
  },
  esbuild: false,
  server: {
    open: true
  },
  plugins: [
    {
      enforce: 'pre',
      ...linaria({
        evaluate: false,
        sourceMap: true,
        exclude: ['node_modules/**']
      })
    } as PluginOption,
    react({
      exclude: ['node_modules/**'],
      babel: {
        configFile: true,
        babelrc: true
      }
    }),
    typeAsJsonSchema()
  ]
});
