import typescript from 'rollup-plugin-typescript2';
import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';

import { DEFAULT_EXTENSIONS } from '@babel/core';

import pkg from './package.json';

const fromEntries = Object.fromEntries || ((entries, obj = Object.create(null)) => {
  for (let [key, value] of entries)
    obj[key] = value;
});
const buildExposed = (basename, cjs = `lib/${basename}.js`, es = `lib/${basename}.mjs`) =>
  [basename, `src/${basename}.ts`, cjs, es];

const exposed = [
  buildExposed('index', pkg.main, pkg.module),
  buildExposed('load'),
  buildExposed('merge'),
  buildExposed('utils')
];

const inputs = exposed.map(([, from]) => from);

const configs = {
  cjs: [
    fromEntries(
      exposed.map(([basename, , cjs]) => [basename, [cjs]])
    ),
    {
      entryFileNames: '[name].js',
      exports: 'named',
      interop: false
    }
  ],
  esm: [
    fromEntries(
      exposed.map(([basename, , , es]) => [basename, [es]])
    ),
    {
      entryFileNames: '[name].mjs',
      interop: false
    }
  ]
};

export default Object.entries(configs).map(([format, [chunks, outputConfig]]) => ({
  input: inputs,
  manualChunks: chunks,
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
    'graphql/language/kinds',
    'graphql/language/printer',
    ...Object.getOwnPropertyNames(pkg.dependencies)
  ]
}));
