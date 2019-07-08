import { DocumentNode } from 'graphql/language/ast';
import { Kind } from 'graphql/language/kinds';
import { GraphQLMergeImportPlugin } from './definitions';
import load, { LoadOptions } from './load';
import merge from './merge';
import { cachePlugin } from './plugins';

export * from './definitions';
export * from './load';
export * from './merge';
export * from './plugins';

export interface GraphQLMergeImportOptions extends LoadOptions {
  plugins?: GraphQLMergeImportPlugin[];
}

export const importSchema = async (
  pathOrUrl: string,
  { plugins = [cachePlugin()], ...options }: GraphQLMergeImportOptions = { },
): Promise<DocumentNode> => {
  const parts = await load(pathOrUrl, plugins, options);
  const mergedDefinitions = await merge(parts, plugins);
  return {
    definitions: [
      ...mergedDefinitions,
    ],
    kind: Kind.DOCUMENT,
  };
};

// FIXME : `const graphqlMergeImport = require('graphql-merge-import')` not working
//         due to incorrect generated types declarations
// export default graphqlMergeImport;
