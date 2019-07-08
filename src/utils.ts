import { DefinitionNode } from 'graphql/language/ast';
import { parse } from 'graphql/language/parser';
import { pathToFileURL, resolve } from 'url';
import { GraphQLImport, GraphQLImportedDocument } from './definitions';

export type Awaitable<T> = T | PromiseLike<T>;
export type UnwrapPromise<T> = T extends PromiseLike<infer R> ? R : T;
export type RemoveVoid<T> = T extends void ? never : T;

export type Plugin<T extends Plugin<T>> = {
  [K in keyof T]: (...args: any) => ReturnType<T[K]>;
};

export const invokePlugins = async <T extends Plugin<T>, K extends keyof T>(
  plugins: T[],
  defaultPlugin: Required<T>,
  operation: K,
  ...args: Parameters<Required<T>[K]>
): Promise<RemoveVoid<UnwrapPromise<ReturnType<Required<T>[K]>>>> => {
  for (const plugin of plugins) {
    const opFn = plugin[operation];
    if (opFn) {
      const result = await opFn.apply(plugin, args);
      if (typeof result === 'string' || (typeof result === 'object' && result)) {
        return result;
      }
    }
  }
  return defaultPlugin[operation].apply(defaultPlugin, args);
};

export const fromEntries: typeof Object.fromEntries = Object.fromEntries || (<T = any>(
  entries: Iterable<readonly [PropertyKey, T]>,
  obj: object = Object.create(null),
): ReturnType<typeof Object.fromEntries> => {
  for (const [key, value] of entries) {
    Object.defineProperty(obj, key, { value });
  }
  return obj;
});

export const resolveToURL = (path: string, base: string = 'file://') => {
  if (/^\/\//.test(path)) { // Protocol relative URLs
    path = new URL(base || 'file://').protocol + path;
  } else if (/^\//.test(path)) {
    path = pathToFileURL(path).href;
  } else if (!/^(.+?):\/\//.test(path)) {
    if (!/^\.\.?\//.test(path)) {
      path = `./${path}`;
    }
    path = resolve(base, path);
    // throw new Error(`Cannot resolve ID « ${path} » - Use the appropriate plugin to handle this format`);
  }
  return path;
};

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

export const parseSDLWithImports = (sdl: string, importRegex?: RegExp): GraphQLImportedDocument => {
  const imports = getImports(sdl, importRegex);
  sdl = sdl.replace(/^\s*#.*?$/mg, '').trim(); // Remove comments to detect files without definitions
  return {
    document: sdl ? parse(sdl, { noLocation: true }) : null,
    imports,
  };
};

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;
type Unwrap<T> = T extends ReadonlyArray<infer R> ? R : never;

type TypeWithProperty<T> = {
  [P in keyof T]: T[P] extends readonly any[] | undefined ? P : never;
}[keyof T];

export const merge = (
  attribute: NonNullable<TypeWithProperty<UnionToIntersection<DefinitionNode>>>,
  toMerge: DefinitionNode,
  original: DefinitionNode,
  conflict: (name: string) => void = () => undefined,
) => {
  if (attribute in toMerge && attribute in original) {
    let from = (original as UnionToIntersection<DefinitionNode>)[attribute];
    const to = (toMerge as UnionToIntersection<DefinitionNode>)[attribute];
    if (!to && from) {
      return original;
    } else if (!from && to) {
      return toMerge;
    }
    if (!from) {
      ((original as UnionToIntersection<DefinitionNode>)[attribute] as any[]) = (from = []);
    }
    // (from as []).push(...((to as []) || []));
    const alreadySet = new Set<string>();
    ((original as UnionToIntersection<DefinitionNode>)[attribute] as any[]) =
      (from as ReadonlyArray<Unwrap<typeof from>> || []).concat(to || []).reduce((acc, entry: Unwrap<typeof from>) => {
        if ('name' in entry) {
          if (alreadySet.has(entry.name.value)) {
            conflict(entry.name.value);
            return acc;
          } else {
            alreadySet.add(entry.name.value);
          }
        }
        acc.push(entry);
        return acc;
      }, ([] as Array<Unwrap<typeof from>>));
  }
};
