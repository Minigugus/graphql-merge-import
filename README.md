# graphql-merge-import

An alternative to [graphql-import](https://github.com/prisma/graphql-import) with builtin types merging & plugins support.

## Features

 * Follow GraphQL statements:
   * `# import 'schema.graphql'`
   * `# import A from 'schema.graphql'`
   * `# import A, B, C from 'schema.graphql'`
   * `# import * from 'schema.graphql'`
   * `# import Query.* from 'schema.graphql'`
   * `# import Query.*, Mutation.*, * from 'schema.graphql'`
   * `# import Post from "../database/schema.graphql"`
 * Faster than [graphql-import](https://github.com/prisma/graphql-import) because **does not** validate generated schema
 * No dependency (out of `graphql-js`)
 * Handle cyclic imports
 * Does **not** filter imported types (eg. remove unused), allowing files with only `#import` (no declaration)
 * Support relative imports: `# import Post from "../database/schema.graphql"`
 * Merge common definitions when possible (eg. multiple `Query` & `Mutation` definitions) and keep definitions
 * Can be extended with *plugins*:
   * HTTP uris imports - works with relative imports in remote files: `# import 'https://raw.githubusercontent.com/danielcooke1996/graphql-import-bug/master/src/typeDefs/index.graphql'`
   * Import programmatically generated schemas: `# import 'schemaGenerator.js'`

## Usage

```ts
import { importSchema } from 'graphql-merge-import';

const aPromise = importSchema('yourSchemaWithImports.graphql');
// => Promise<DocumentNode>

// TIP : in order to get the SDL equivalent (textual form), use `print` in `graphql`.
```

You can also pass a second arguments:
```ts
interface Options {
  /** The base directory or URL */
  dir?: string
  /** Plugins to use */
  plugins?: GraphQLMergeImportPlugin[]
}
```

## Plugins

Currently, there are 2 builtin plugins :

```ts
import {
  httpPlugin, // Add HTTP URLs support
  dynamicImportPlugin // 
} from 'graphql-merge-import/lib/plugins';
```

You can develop your own plugins by implementing the following interface :

```ts
interface GraphQLMergeImportPlugin {

  /** Resolve an import identifier to an URL */
  resolveId?(importee: string, importer?: string): Awaitable<void | string>;

  /** Load the document represented by the `url` parameter */
  load?(url: string): Awaitable<void | string | GraphQLImportedDocument>;

  /** Transform a document (eg. Remove unused definitions) */
  transform?(ast: DocumentNode, origin: GraphQLImport): Awaitable<void | DocumentNode>;

  /** Resolve conflicts with definitions */
  mergeTypes?(toMerge: DefinitionNode, original: DefinitionNode): Awaitable<void | DefinitionNode>;

}
```

## Example

### Simple

```ts
import { importSchema } from 'graphql-merge-import'
import { makeExecutableSchema } from 'graphql-tools'

(async () => {
  const typeDefs = await importSchema('schema.graphql')
  const resolvers = {}

  const schema = makeExecutableSchema({ typeDefs, resolvers })
})()
```

Assume the following directory structure:

```
.
├── schema.graphql
├── posts.graphql
└── comments.graphql
```

`schema.graphql`

```graphql
#import "posts.graphql"
#import * from "comments.graphql"
```

`posts.graphql`

```graphql
# import Comment from 'comments.graphql'

type Query {
  posts: [Post!]!
  getPost(id: ID!): Post
}

type Post {
  comments: [Comment!]!
  id: ID!
  text: String!
  tags: [String]!
}
```

`comments.graphql`

```graphql
type Query {
  comments: [Comment!]!
  getComment(id: ID!): Comment
}

type Comment {
  id: ID!
  text: String!
}
```

Running `importSchema('schema.graphql').then(console.log)` produces the following output:

```graphql
type Query {
  posts: [Post!]!
  getPost(id: ID!): Post
  comments: [Comment!]!
  getComment(id: ID!): Comment
}

type Post {
  comments: [Comment!]!
  id: ID!
  text: String!
  tags: [String]!
}

type Comment {
  id: ID!
  text: String!
}
```

### With plugins

```ts
import { print } from 'graphql/language/printer';

import { importSchema } from 'graphql-merge-import';
import { httpPlugin } from 'graphql-merge-import/lib/plugis';

(async () => {
  const typeDefs = await importSchema('https://raw.githubusercontent.com/danielcooke1996/graphql-import-bug/master/src/typeDefs/index.graphql', {
    plugins: [
      httpPlugin()
    ]
  });
  const schema = print(typeDefs);
  console.log(schema);
})();
```
