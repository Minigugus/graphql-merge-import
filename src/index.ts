import { DocumentNode } from 'graphql/language/ast';
import { Kind } from 'graphql/language/kinds';
import { load, LoadOptions } from './load';
import merge, { MergeOptions } from './merge';

export * from './load';

export type GraphQLMergeImportOptions = LoadOptions & MergeOptions;

export const graphqlMergeImport =
  async (pathOrUrl: string, options: GraphQLMergeImportOptions = {}): Promise<DocumentNode> => {
    const parts = await load(pathOrUrl, options);
    const mergedDefinitions = await merge(parts, options);
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
