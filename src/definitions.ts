import { DefinitionNode, DocumentNode } from 'graphql/language/ast';
import { Awaitable } from './utils';

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

export interface MergePlugin {
  mergeTypes?(toMerge: DefinitionNode, original: DefinitionNode): Awaitable<void | DefinitionNode>;
}

export interface GraphQLMergeImportPlugin extends LoadPlugin, MergePlugin { }
