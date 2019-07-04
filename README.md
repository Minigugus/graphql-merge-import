# graphql-merge-import

Like `graphql-import` - follow `# import` instructions - but :
 * Like `rollup`, supports **plugins** to *hook* imports :
   * Imported URLs can be transformed, allowing **bare imports** for instance
   * Support **SDL transformation**, allowing importation from a `.js` file for instance
   * Support custom **collision resolver** that handle conflicts between imported definitions
 * By default, **merge definitions** with the same name (ex : multiple definition of `Query`) if possible & try to preserve **directives**
 * By default, unlike `graphql-import`, import **all definitions** from imported files

## Usage

```javascript
import { graphqlMergeImport } from 'graphql-merge-import';

const aPromise = graphqlMergeImport('yourSchemaWithImports.graphql');
// => Promise<DocumentNode>

// TIP : in order to get the SDL equivalent (textual form), use `print` in `graphql`.
```