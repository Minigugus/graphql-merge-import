import { DocumentNode } from 'graphql/language/ast';
import { Kind } from 'graphql/language/kinds';
import { load, LoadOptions } from './load';
import merge, { MergeOptions } from './merge';

export * from './load';

export type GraphQLMergeImportOptions = LoadOptions & MergeOptions;

export const graphqlMergeImport = async (pathOrUrl: string, options: GraphQLMergeImportOptions = {}) => {
  const parts = await load(pathOrUrl, options);
  const mergedDefinitions = await merge(
    [...parts.values()]
      .reduce((acc, part) => {
        if (part.document) {
          acc.push(part.document);
        }
        return acc;
      }, ([] as DocumentNode[])),
    options,
  );
  const finalDocument: DocumentNode = {
    definitions: [
      ...mergedDefinitions,
    ],
    kind: Kind.DOCUMENT,
  };
  return finalDocument;
};

// FIXME : `const graphqlMergeImport = require('graphql-merge-import')` not working
//         due to incorrect generated types declarations
// export default graphqlMergeImport;
