import { readFile as readFileWithCb } from 'fs';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

import { DocumentNode } from 'graphql/language/ast';

import { GraphQLImport, LoadPlugin } from './definitions';
import { cachePlugin } from './plugins';
import { invokePlugins, parseSDLWithImports, resolveToURL } from './utils';

// Avoid warning in Node 10.x when using `fs.promises` instead
const readFile = promisify(readFileWithCb);

export const defaultLoadPlugin: (dir?: string, importRegExp?: RegExp) => Required<LoadPlugin> =
  (dir = process.cwd(), importRegExp) => {
    const { load: cache } = cachePlugin();
    dir = resolveToURL(dir);
    return {
      async load(url) {
        const cached = await cache(url);
        if (cached) {
          return cached;
        }
        const { protocol } = new URL(url);
        if (protocol !== 'file:') {
          throw new Error(
            `Unsupported protocol « ${protocol} » - Use the appropriate plugin to handle this protocol`,
          );
        }
        return parseSDLWithImports(await readFile(fileURLToPath(url), 'utf8'), importRegExp);
      },
      resolveId(importee, importer) {
        return resolveToURL(importee, importer || dir);
      },
      transform(ast) {
        return ast; // Not transformation
      },
    };
  };

export interface LoadOptions {
  dir?: string;
  importRegex?: RegExp;
}

export default async (id: string, plugins: LoadPlugin[] = [], { dir, importRegex }: LoadOptions = {}) => {
  const defaultPlugin = defaultLoadPlugin(dir, importRegex);
  const loadedList: DocumentNode[] = [];
  const importGraphQL = async (toImport: GraphQLImport) => {
    // Stage 1 : Load the requested document
    let loaded = await invokePlugins(plugins, defaultPlugin, 'load', toImport.id);
    if (typeof loaded === 'string') {
      loaded = parseSDLWithImports(loaded, importRegex);
    }
    // Stage 2 : Transform the AST if required
    if (loaded.document) {
      loaded.document = await invokePlugins(plugins, defaultPlugin, 'transform', loaded.document, toImport);
      loadedList.push(loaded.document);
    }
    // Stage 3 & 4 : Resolve imports IDs + Load recursively importations
    await Promise.all(
      loaded.imports.map(async (childImport) => {
        // Stage 3 : Resolve imports IDs
        childImport.id = await invokePlugins(plugins, defaultPlugin, 'resolveId', childImport.id, toImport.id);
        // Stage 4 : Load recursively importations
        await importGraphQL(childImport);
      }),
    );
  };
  await importGraphQL({ requested: '*', id: await invokePlugins(plugins, defaultPlugin, 'resolveId', id, undefined) });
  return loadedList;
};
