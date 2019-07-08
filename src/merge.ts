import { DefinitionNode, DocumentNode } from 'graphql/language/ast';
import { MergePlugin } from './definitions';
import { invokePlugins, merge } from './utils';

export const defaultMergePlugin: () => Required<MergePlugin> = () => ({
  mergeTypes(toMerge, original) {
    if (toMerge.kind === original.kind) {
      merge('directives', toMerge, original);
      merge('fields', toMerge, original, (name: string) => {
        throw new Error(`Field "${name}" defined multiple times`);
      });
      merge('values', toMerge, original, (name: string) => {
        throw new Error(`Value "${name}" defined multiple times`);
      });
    } else {
      throw new Error(
        `No plugin specified to handle ${
        ('name' in toMerge && toMerge.name ? `"${toMerge.name.value}" of ` : ' ')
        }types "${toMerge.kind}"${toMerge.kind !== original.kind ? ` and "${original.kind}"` : ''}`,
      );
    }
    return original;
  },
});

export default async (parts: DocumentNode[], plugins: MergePlugin[]) => {
  const defaultPlugin = defaultMergePlugin();
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
