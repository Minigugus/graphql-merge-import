import { promises as fs } from 'fs';
import { pathToFileURL, resolve } from 'url';

import { parse } from 'graphql';
import { DocumentNode } from 'graphql/language/ast';

import { Awaitable, invokePlugins } from './utils';

export interface GraphQLImport {
  requested: '*' | string[];
  id: string;
}

export interface GraphQLImportedDocument {
  imports: GraphQLImport[];
  document: null | DocumentNode;
}

export interface LoadPlugin {
  resolveId?(importee: string, importer?: string): Awaitable<void | string>;
  load?(toImport: GraphQLImport): Awaitable<void | string | GraphQLImportedDocument>;
  transform?(ast: DocumentNode): Awaitable<void | DocumentNode>;
}

export const getImports = (sdl: string): GraphQLImport[] => {
  const imports: GraphQLImport[] = [];
  const importRegex = /#\s?import\s+(?:(\*|(?:.+?))\s+from\s+)?('|")([^"']+)\2;?/g;
  for (let match: RegExpExecArray | null; (match = importRegex.exec(sdl)) !== null; null) {
    imports.push({
      id: match[3],
      requested: (!match[1] || match[1] === '*' ? '*' : match[1].split(',').map((s) => s.trim()).filter((s) => s)),
    });
  }
  return imports;
};

export const parseSDLWithImports = (sdl: string): GraphQLImportedDocument => {
  const imports = getImports(sdl);
  sdl = sdl.replace(/^\s*#.*?$/mg, '').trim();
  return {
    document: sdl ? parse(sdl, { noLocation: true }) : null,
    imports,
  };
};

export const defaultLoadPlugin: (options: { dir?: string }) => Required<LoadPlugin> =
  ({ dir = pathToFileURL(process.cwd()).href }) => ({
    async load({ id }) {
      let code: string;
      const protocol: string | undefined = (/^(.+?):\/\//.exec(id) || [])[1];
      switch (protocol) {
        case 'file':
          id = id.slice(7); // Remove `file://`
        case undefined:
          code = await fs.readFile(id, 'utf8');
          break;

        default:
          throw new Error(`Unsupported protocol « ${protocol} » - Use the appropriate plugin to handle this protocol`);
      }
      return parseSDLWithImports(code);
    },
    resolveId(importee, importer) {
      if (/^\/\//.test(importee)) {
        importee = `file:${importee}`;
      } else if (/^\//.test(importee)) {
        importee = `file://${importee}`;
      } else if (/^\.\.?\//.test(importee)) {
        importee = resolve(importer || dir, importee);
      }
      return importee;
    },
    transform(ast) {
      return ast;
    },
  });

export interface LoadOptions {
  dir?: string;
  plugins?: LoadPlugin[];
}

export const load = async (id: string, { plugins = [], ...config }: LoadOptions) => {
  const defaultPlugin = defaultLoadPlugin(config);
  const loadedCache = new Map<string, GraphQLImportedDocument | null>();
  const importGraphQL = async (toImport: GraphQLImport) => {
    // Stage 0 : Memoize imports
    if (loadedCache.has(toImport.id)) { // Prevent cyclic importations
      return;
    }
    loadedCache.set(toImport.id, null);
    // Stage 1 : Load the requested document
    let loaded = await invokePlugins(plugins, defaultPlugin, 'load', toImport);
    if (typeof loaded === 'string') {
      loaded = parseSDLWithImports(loaded);
    }
    loadedCache.set(toImport.id, loaded);
    // Stage 2 : Transform the AST if required
    if (loaded.document) {
      loaded.document = await invokePlugins(plugins, defaultPlugin, 'transform', loaded.document);
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
  return loadedCache as Map<string, GraphQLImportedDocument>;
};
