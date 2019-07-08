import typescript from 'rollup-plugin-typescript2';
import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';

import { DEFAULT_EXTENSIONS } from '@babel/core';

const chunk = basename => `src/${basename}.ts`;

const inputs = [
  chunk('index'),
  chunk('load'),
  chunk('merge'),
  chunk('utils'),
  chunk('plugins')
];

const configs = {
  cjs: {
    entryFileNames: '[name].js',
    exports: 'named',
    interop: false
  },
  esm: {
    entryFileNames: '[name].mjs',
    interop: false
  }
};

export default Object.entries(configs).map(([format, outputConfig]) => ({
  input: inputs,
  output: Object.assign({
    format,
    dir: 'lib'
  }, outputConfig),
  plugins: [
    typescript({
      rollupCommonJSResolveHack: true,
      tsconfigOverride: {
        compilerOptions: {
          declaration: true
        }
      }
    }),
    resolve({
      jail: __dirname,
      modulesOnly: true,
      preferBuiltins: true,
      extensions: ['.ts', '.mjs', '.js', '.json']
    }),
    babel({
      extensions: [
        ...DEFAULT_EXTENSIONS,
        '.ts'
      ]
    })
  ],
  external: [
    'fs',
    'url',
    'util',
    'http',
    'https',
    'graphql/language/kinds',
    'graphql/language/parser'
  ]
}));
