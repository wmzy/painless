/* eslint-disable import/no-extraneous-dependencies */

import * as path from 'path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import wyw from '@wyw-in-js/vite';
import rollupPluginTypeAsJsonSchema from 'rollup-plugin-type-as-json-schema';

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: `${path.join(import.meta.dirname, 'src/$1')}`
      }
    ]
  },
  server: {
    open: true
  },
  plugins: [
    react({
      exclude: ['node_modules/**']
    }),
    rollupPluginTypeAsJsonSchema(),
    wyw({
      sourceMap: true,
      exclude: ['node_modules/**']
    })
  ],
  optimizeDeps: {
    include: ['babel-runtime-jsx-plus']
  }
});
