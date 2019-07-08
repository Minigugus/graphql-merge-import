import { ASTKindToNode, DefinitionNode, DirectiveNode } from 'graphql/language/ast';
import { Kind } from 'graphql/language/kinds';
import { request as httpRequest } from 'http';
import { request as httpsRequest, RequestOptions } from 'https';
import { fileURLToPath } from 'url';
import { GraphQLImportedDocument } from './definitions';
import { parseSDLWithImports } from './utils';

// Load

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

export const httpPlugin = (
  {
    log = () => undefined,
    ...options
  }: RequestOptions & { log?: (url: string) => void } = {},
) => {
  const { load: cache } = cachePlugin();
  return {
    async load(url: string) {
      const { protocol } = new URL(url);
      switch (protocol) {
        case 'http:':
        case 'https:':
          log(url);
          const cached = await cache(url);
          if (cached) {
            return cached;
          }
          return new Promise<string>((resolve, reject) => {
            (protocol === 'https:' ? httpsRequest : httpRequest)(url, options, (resp) => {
              if (Math.floor((resp.statusCode || 0) / 100) !== 2) { // Treat 2xx HTTP codes as errors
                reject(new Error('Failed to fetch schema : ' + resp.statusCode + ' ' + resp.statusMessage));
              } else {
                let code = '';
                const data = (txt: string) => code += txt;
                const end = () => (
                  resp.off('data', data),
                  resp.off('end', end),
                  resolve(code)
                );
                resp.on('data', data);
                resp.on('end', end);
              }
            }).end();
          });

        default:
          return;
      }
    },
  };
};

export const dynamicImportPlugin = ({
  allowFunctions = false,
  exportName,
  jsRegex: urlRegex = /\.js$/i,
  log = () => undefined,
}: { allowFunctions?: boolean, exportName?: string, jsRegex?: RegExp, log?: (url: string) => void } = {}) => {
  const { load: cache} = cachePlugin();
  return {
    async load(url: string) {
      if (urlRegex.test(url)) {
        const { protocol } = new URL(url);
        if (protocol === 'file:') {
          const cached = await cache(url);
          if (cached) {
            return cached;
          }
          url = fileURLToPath(url);
          log(url);
          let typeDef = exportName ? require(url)[exportName] : require(url);
          if (typeof typeDef === 'function') {
            if (!allowFunctions) {
              throw new Error(`"${url}" exported a function, which is not allowed`);
            }
            typeDef = typeDef();
          }
          if (typeDef instanceof Promise) {
            typeDef = await typeDef;
          }
          if (typeof typeDef === 'string') {
            typeDef = parseSDLWithImports(typeDef);
          }
          return typeDef;
        }
      }
    },
  };
};

// Merge

export type SelectASTKind<
  T extends Partial<ASTKindToNode[keyof ASTKindToNode]>,
  U extends keyof ASTKindToNode = keyof ASTKindToNode> =
  ASTKindToNode[U] extends T ? ASTKindToNode[U] : never;

export type ConflictResolver<K extends keyof ASTKindToNode = keyof ASTKindToNode> =
  (toMerge: ASTKindToNode[K], original: DefinitionNode) => DefinitionNode;
export type KindToConflictResolvers = {
  [K in keyof ASTKindToNode]?: ConflictResolver<K>
};

export const mergeDirectives = <
  T extends keyof ASTKindToNode,
  R extends SelectASTKind<{ directives?: ReadonlyArray<DirectiveNode> }, T>
>(toMerge: R, original: R) => {
  if (toMerge.directives) {
    const directives = (original.directives as DirectiveNode[]) || [];
    const definedSet = new Set(directives.map((d) => d.name.value));
    toMerge.directives.reduce((acc, directive) => {
      const name = directive.name.value;
      if (definedSet.has(name)) {
        definedSet.add(name);
        acc.push(directive);
      }
      return acc;
    }, directives);
    if (!original.directives) {
      Object.assign(original, { directives });
    }
  }
  return original;
};

export const mergeFields = <
  T extends keyof ASTKindToNode,
  R extends SelectASTKind<{ fields: any[], directives?: ReadonlyArray<DirectiveNode> }, T>
>(toMerge: R, original: R) => {
  mergeDirectives<T, R>(toMerge, original);
  if (!toMerge.fields) {
    return original;
  } else if (!original.fields) {
    return toMerge;
  }
  original.fields.push(...toMerge.fields);
  return original;
};

export const mergeValues = <
  T extends keyof ASTKindToNode,
  R extends SelectASTKind<{ values: any[], directives?: ReadonlyArray<DirectiveNode> }, T>
>(toMerge: R, original: R) => {
  mergeDirectives<T, R>(toMerge, original);
  if (!toMerge.values) {
    return original;
  } else if (!original.values) {
    return toMerge;
  }
  original.values.push(...toMerge.values);
  return original;
};

export const noMerge: ConflictResolver = (_, original) => original;

export const defaultResolvers: KindToConflictResolvers = {
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: mergeFields,
  [Kind.INTERFACE_TYPE_DEFINITION]: mergeFields,
  [Kind.OBJECT_TYPE_DEFINITION]: mergeFields,
  [Kind.UNION_TYPE_DEFINITION]: mergeFields,

  [Kind.SCALAR_TYPE_DEFINITION]: noMerge,
  [Kind.DIRECTIVE_DEFINITION]: noMerge,

  [Kind.ENUM_TYPE_DEFINITION]: mergeValues,
};

export const perKindMergePlugin =
  (resolvers: KindToConflictResolvers = defaultResolvers) => ({
    mergeTypes(toMerge: DefinitionNode, original: DefinitionNode) {
      if (toMerge.kind === original.kind && toMerge.kind in resolvers) {
        const resolver = resolvers[toMerge.kind];
        if (resolver) {
          const result = resolver(toMerge as any, original);
          if (result) {
            return result;
          }
        }
      }
    },
  });
