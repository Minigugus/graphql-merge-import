import { ASTKindToNode, DefinitionNode, DirectiveNode, DocumentNode } from 'graphql/language/ast';
import { Kind } from 'graphql/language/kinds';
import { Awaitable, invokePlugins } from './utils';

export interface MergePlugin {
  mergeTypes?(toMerge: DefinitionNode, original: DefinitionNode): Awaitable<void | DefinitionNode>;
}

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
  original.values.push(...toMerge.values);
  mergeDirectives<T, R>(toMerge, original);
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

export const defaultMergePlugin: (options: { resolvers?: KindToConflictResolvers }) => Required<MergePlugin> =
  ({ resolvers = defaultResolvers }) => ({
    mergeTypes(toMerge, original) {
      if (toMerge.kind !== original.kind) {
        throw new Error(`Unable to merge ${
          ('name' in toMerge && toMerge.name ? `"${toMerge.name.value}" of` : '')
          }types "${toMerge.kind}" and "${original.kind}"`);
      } else if ((toMerge.kind in resolvers)) {
        const resolver = resolvers[toMerge.kind];
        if (resolver) {
          const result = resolver(toMerge as any, original);
          if (result) {
            return result;
          }
        }
      }
      throw new Error(`No resolver to resolve conflict with types "${toMerge.kind}"`);
    },
  });

export interface MergeOptions {
  resolvers?: KindToConflictResolvers;
  plugins?: MergePlugin[];
}

export default async (
  parts: DocumentNode[],
  {
    plugins = [],
    ...config
  }: MergeOptions,
) => {
  const defaultPlugin = defaultMergePlugin(config);
  const definitionsTable = new Map<any, DefinitionNode>();
  for (const part of parts) {
    for (const definition of part.definitions) {
      if ('name' in definition && definition.name) {
        const name = definition.name.value;
        const original = definitionsTable.get(name);
        if (original) {
          definitionsTable.set(
            name,
            await invokePlugins(
              plugins,
              defaultPlugin,
              'mergeTypes',
              definition,
              original,
            ),
          );
        } else {
          definitionsTable.set(name, definition);
        }
      } else {
        definitionsTable.set(definition, definition);
      }
    }
  }
  return [...definitionsTable.values()];
};
