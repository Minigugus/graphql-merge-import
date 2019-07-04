import { readFile as readFileWithCb } from 'fs';
import { pathToFileURL, resolve } from 'url';
import { promisify } from 'util';

import { DocumentNode } from 'graphql/language/ast';
import { parse } from 'graphql/language/parser';

import { Awaitable, invokePlugins } from './utils';

// Avoid warning in Node 10.x
const readFile = promisify(readFileWithCb);

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
  load?(url: string): Awaitable<void | string | GraphQLImportedDocument>;
  transform?(ast: DocumentNode, origin: GraphQLImport): Awaitable<void | DocumentNode>;
}

export const getImports = (
  sdl: string,
  importRegex = /#\s?import\s+(?:(\*|(?:.+?))\s+from\s+)?('|")([^"']+)\2;?/g,
  splitRegex = /,/,
): GraphQLImport[] => {
  const imports: GraphQLImport[] = [];
  const regexp = RegExp(importRegex.source, importRegex.flags); // Avoid problems as `importRegex` is global
  for (let match: RegExpExecArray | null; (match = regexp.exec(sdl)) !== null; null) {
    imports.push({
      id: match[3],
      requested: (!match[1] || match[1] === '*'
        ? '*'
        : match[1].split(splitRegex).map((s) => s.trim()).filter((s) => s)
      ),
    });
  }
  return imports;
};

export const cachePlugin = () => {
  const importCache = new Set<string>();
  return {
    async load(url: string): Promise<void | GraphQLImportedDocument> {
      if (importCache.has(url)) {
        return { // Fake an empty document to prevent cyclic importations
          document: null,
          imports: [],
        };
      }
      importCache.add(url);
    },
  };
};

export const parseSDLWithImports = (sdl: string, importRegex?: RegExp): GraphQLImportedDocument => {
  const imports = getImports(sdl, importRegex);
  sdl = sdl.replace(/^\s*#.*?$/mg, '').trim(); // Remove comments to detect files without definitions
  return {
    document: sdl ? parse(sdl, { noLocation: true }) : null,
    imports,
  };
};

export const defaultLoadPlugin: (dir?: string, importRegExp?: RegExp) => Required<LoadPlugin> =
  (dir = pathToFileURL(process.cwd()).href, importRegExp) => {
    const cache = cachePlugin();
    return {
      async load(url) {
        const cached = await cache.load(url);
        if (cached) {
          return cached;
        }
        let code: string;
        const protocol: string | undefined = (/^(.+?):\/\//.exec(url) || [])[1];
        switch (protocol) {
          case 'file':
            url = url.slice(7); // Remove `file://`
          case undefined: // If the id is not an URL, assume it's a path
            code = await readFile(url, 'utf8');
            break;

          default:
            throw new Error(
              `Unsupported protocol « ${protocol} » - Use the appropriate plugin to handle this protocol`,
            );
        }
        return parseSDLWithImports(code, importRegExp);
      },
      resolveId(importee, importer) {
        if (/^\/\//.test(importee)) { // Protocol relative URLs
          importee = new URL(importer || 'file://').protocol + importee;
        } else if (/^\//.test(importee)) {
          importee = pathToFileURL(importee).href;
        } else if (/^\.\.?\//.test(importee)) {
          importee = resolve(importer || dir, importee);
        } else if (!/^(.+?):\/\//.test(importee)) {
          throw new Error(`Cannot resolve ID « ${importee} » - Use the appropriate plugin to handle this format`);
        }
        return importee;
      },
      transform(ast) {
        return ast; // Not transformation
      },
    };
  };

export interface LoadOptions {
  dir?: string;
  importRegex?: RegExp;
  plugins?: LoadPlugin[];
}

export const load = async (id: string, { plugins = [], dir, importRegex }: LoadOptions) => {
  const defaultPlugin = defaultLoadPlugin(dir, importRegex);
  const loadedList = new Set<DocumentNode>();
  const importGraphQL = async (toImport: GraphQLImport) => {
    // Stage 1 : Load the requested document
    let loaded = await invokePlugins(plugins, defaultPlugin, 'load', toImport.id);
    if (typeof loaded === 'string') {
      loaded = parseSDLWithImports(loaded, importRegex);
    }
    // Stage 2 : Transform the AST if required
    if (loaded.document) {
      loaded.document = await invokePlugins(plugins, defaultPlugin, 'transform', loaded.document, toImport);
      loadedList.add(loaded.document);
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
  return [...loadedList.values()];
};
