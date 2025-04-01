// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  BaseTemplateDataSource,
  IProjectNetworkConfig,
  CommonSubqueryProject,
  FileReference,
  Processor,
  ProjectManifestV1_0_0,
  BaseDataSource,
  SecondLayerHandlerProcessor_0_0_0,
  SecondLayerHandlerProcessor_1_0_0,
  DsProcessor,
  BaseCustomDataSource,
  IEndpointConfig,
} from '@subql/types-core';
import {
  SolanaBlockFilter,
  SolanaLogFilter,
  SolanaTransactionFilter,
  SolanaInstructionFilter,
  SolanaBlock,
  SolanaTransaction,
  SolanaInstruction,
} from './solana';
type ApiWrapper = unknown; // TODO

export type RuntimeDatasourceTemplate = BaseTemplateDataSource<SubqlRuntimeDatasource>;
export type CustomDatasourceTemplate = BaseTemplateDataSource<SubqlCustomDatasource>;

export type SolanaProjectManifestV1_0_0 = ProjectManifestV1_0_0<SubqlRuntimeDatasource | SubqlCustomDatasource>;

/**
 * Kind of Solana datasource.
 * @enum {string}
 */
export enum SolanaDatasourceKind {
  /**
   * The runtime kind of Solana datasource.
   */
  Runtime = 'solana/Runtime',
}

/**
 * Enum representing the kind of Solana handler.
 * @enum {string}
 */
export enum SolanaHandlerKind {
  /**
   * Handler for Solana blocks.
   */
  Block = 'solana/BlockHandler',
  /**
   * Handler for Solana transactions.
   */
  Transaction = 'solana/TransactionHandler',

  /**
   * Handler for Solana instructions.
   */
  Instruction = 'solana/InstructionHandler',

  /**
   * Handler for Solana logs.
   */
  Log = 'solana/LogHandler',
}

export type SolanaRuntimeHandlerInputMap = {
  [SolanaHandlerKind.Block]: SolanaBlock;
  [SolanaHandlerKind.Transaction]: SolanaTransaction;
  [SolanaHandlerKind.Instruction]: SolanaInstruction; // TODO
  [SolanaHandlerKind.Log]: never; // TODO
};

type SolanaRuntimeFilterMap = {
  [SolanaHandlerKind.Block]: SolanaBlockFilter;
  [SolanaHandlerKind.Transaction]: SolanaTransactionFilter;
  [SolanaHandlerKind.Instruction]: SolanaInstructionFilter;
  [SolanaHandlerKind.Log]: SolanaLogFilter;
};

/**
 * Represents a handler for Solana blocks.
 * @type {SubqlCustomHandler<SolanaHandlerKind.Block, SolanaBlockFilter>}
 */
export type SubqlBlockHandler = SubqlCustomHandler<SolanaHandlerKind.Block, SolanaBlockFilter>;
/**
 * Represents a handler for Solana transactions.
 * @type {SubqlCustomHandler<SolanaHandlerKind.Transaction, SolanaTransactionFilter>}
 */
export type SubqlTransactionHandler = SubqlCustomHandler<SolanaHandlerKind.Transaction, SolanaTransactionFilter>;

/**
 * Represents a handler for Solana transactions.
 * @type {SubqlCustomHandler<SolanaHandlerKind.Instruction, SolanaInstructionFilter>}
 */
export type SubqlInstructionHandler = SubqlCustomHandler<SolanaHandlerKind.Instruction, SolanaInstructionFilter>;

/**
 * Represents a handler for Solana log.
 * @type {SubqlCustomHandler<SolanaHandlerKind.Log, SolanaLogFilter>}
 */
export type SubqlLogHandler = SubqlCustomHandler<SolanaHandlerKind.Log, SolanaLogFilter>;

/**
 * Represents a generic custom handler for Solana.
 * @interface
 * @template K - The kind of the handler (default: string).
 * @template F - The filter type for the handler (default: Record<string, unknown>).
 */
export interface SubqlCustomHandler<K extends string = string, F = Record<string, unknown>> {
  /**
   * The kind of handler. For `solana/Runtime` datasources this is either `Block`, `Transaction`, `Instruction` or `Log` kinds.
   * The value of this will determine the filter options as well as the data provided to your handler function
   * @type {SolanaHandlerKind.Block | SolanaHandlerKind.Transaction | string }
   * @example
   * kind: SolanaHandlerKind.Block // Defined with an enum, this is used for runtime datasources

   */
  kind: K;
  /**
   * The name of your handler function. This must be defined and exported from your code.
   * @type {string}
   * @example
   * handler: 'handleBlock'
   */
  handler: string;
  /**
   * The filter for the handler. The handler kind will determine the possible filters (optional).
   *
   * @type {F}
   */
  filter?: F;
}

/**
 * Represents a runtime handler for Solana, which can be a block handler, transaction handler, or log handler.
 * @type {SubqlBlockHandler | SubqlTransactionHandler }
 */
export type SubqlRuntimeHandler = SubqlBlockHandler | SubqlTransactionHandler | SubqlInstructionHandler | SubqlLogHandler;

/**
 * Represents a handler for Solana, which can be a runtime handler or a custom handler with unknown filter type.
 * @type {SubqlRuntimeHandler | SubqlCustomHandler<string, unknown>}
 */
export type SubqlHandler = SubqlRuntimeHandler | SubqlCustomHandler<string, unknown>;

/**
 * Represents a filter for Solana runtime handlers, which can be a block filter, call filter, or event filter.
 * @type {SolanaBlockFilter | SolanaTransactionFilter | SolanaInstructionFilter | SolanaLogFilter}
 */
export type SubqlHandlerFilter = SolanaBlockFilter | SolanaTransactionFilter | SolanaInstructionFilter | SolanaLogFilter;

/**
 * Represents a mapping for Solana handlers, extending FileReference.
 * @interface
 * @extends {FileReference}
 */
export interface SubqlMapping<T extends SubqlHandler = SubqlHandler> extends FileReference {
  /**
   * An array of handlers associated with the mapping.
   * @type {T[]}
   * @example
   * handlers: [{
        kind: SolanaHandlerKind.Transaction,
        handler: 'handleTransfer',
        filter: {
          to: '0x220866B1A2219f40e72f5c628B65D54268cA3A9D',
        }
      }]
   */
  handlers: T[];
}

export interface SubqlSolanaProcessorOptions {
  /**
   * The name of the abi that is provided in the assets
   * This is the abi that will be used to decode transaction or log arguments
   * @example
   * abi: 'erc20',
   * */
  abi?: string;
  /**
   * The specific contract that this datasource should filter.
   * Alternatively this can be left blank and a transaction to filter can be used instead
   * @example
   * address: '0x220866B1A2219f40e72f5c628B65D54268cA3A9D',
   * */
  address?: string;
}

/**
 * Represents a runtime datasource for Solana.
 * @interface
 * @template M - The mapping type for the datasource (default: SubqlMapping<SubqlRuntimeHandler>).
 */
export interface SubqlRuntimeDatasource<M extends SubqlMapping<SubqlRuntimeHandler> = SubqlMapping<SubqlRuntimeHandler>>
  extends BaseDataSource<SubqlRuntimeHandler, M> {
  /**
   * The kind of the datasource, which is `solana/Runtime`.
   * @type {SolanaDatasourceKind.Runtime}
   */
  kind: SolanaDatasourceKind.Runtime;
  /**
   * Options to specify details about the contract and its interface
   * @example
   * options: {
   *   abi: 'erc20',
   *   address: '0x220866B1A2219f40e72f5c628B65D54268cA3A9D',
   * }
   * */
  options?: SubqlSolanaProcessorOptions;
  /**
   * ABI or contract artifact files that are used for decoding.
   * These are used for codegen to generate handler inputs and contract interfaces
   * @example
   * assets: new Map([
   *  ['erc721', { file: "./abis/erc721.json" }],
   *  ['erc1155', { file: "./abis/erc1155.json" }],
   * ])
   * */
  assets?: Map<string, FileReference>;
}

export type SubqlDatasource = SubqlRuntimeDatasource | SubqlCustomDatasource;

export interface SubqlCustomDatasource<
  K extends string = string,
  M extends SubqlMapping = SubqlMapping<SubqlCustomHandler>,
  O = any
> extends BaseCustomDataSource<SubqlHandler, M> /*ISubqlDatasource<M>*/ {
  /**
   * The kind of the datasource, which is `solana/Runtime`.
   * @type {K}
   */
  kind: K;
  /**
   * Options to specify details about the contract and its interface
   * @example
   * options: {
   *   abi: 'erc20',
   *   address: '0x220866B1A2219f40e72f5c628B65D54268cA3A9D',
   * }
   * */
  options?: SubqlSolanaProcessorOptions;
  /**
   * ABI or contract artifact files that are used for decoding.
   * These are used for codegen to generate handler inputs and contract interfaces
   * @example
   * assets: new Map([
   *  ['erc721', { file: "./abis/erc721.json" }],
   *  ['erc1155', { file: "./abis/erc1155.json" }],
   * ])
   * */
  assets?: Map<string, FileReference>;
  /**
   * @example
   * processor: {
   *    file: './node_modules/@subql/frontier-evm-processor/dist/bundle.js',
   *    options: {
   *      abi: 'erc20',
   *      address: '0x322E86852e492a7Ee17f28a78c663da38FB33bfb',
   *    }
   *  }
   */
  processor: Processor<O>;
}

export type SecondLayerHandlerProcessor<
  K extends SolanaHandlerKind,
  F extends Record<string, unknown>, // SolanaRuntimeFilterMap?
  E,
  DS extends SubqlCustomDatasource = SubqlCustomDatasource
> =
  | SecondLayerHandlerProcessor_0_0_0<K, SolanaRuntimeHandlerInputMap, SolanaRuntimeFilterMap, F, E, DS, ApiWrapper>
  | SecondLayerHandlerProcessor_1_0_0<
    K,
    SolanaRuntimeHandlerInputMap,
    SolanaRuntimeFilterMap,
    F,
    E,
    DS,
    ApiWrapper
  >;

export type SecondLayerHandlerProcessorArray<
  K extends string,
  F extends Record<string, unknown>,
  T,
  DS extends SubqlCustomDatasource<K> = SubqlCustomDatasource<K>
> =
  | SecondLayerHandlerProcessor<SolanaHandlerKind.Block, F, T, DS>
  | SecondLayerHandlerProcessor<SolanaHandlerKind.Transaction, F, T, DS>
  | SecondLayerHandlerProcessor<SolanaHandlerKind.Instruction, F, T, DS>;

export type SubqlDatasourceProcessor<
  K extends string,
  F extends Record<string, unknown>,
  DS extends SubqlCustomDatasource<K> = SubqlCustomDatasource<K>,
  P extends Record<string, SecondLayerHandlerProcessorArray<K, F, any, DS>> = Record<
    string,
    SecondLayerHandlerProcessorArray<K, F, any, DS>
  >
> = DsProcessor<DS, P, ApiWrapper>;

export interface ISolanaEndpointConfig extends IEndpointConfig {
  /**
   *  The JSON RPC batch size, if this is set to 0 it will not use batch requests
   * */
  batchSize?: number;
}

/**
 * Represents a Solana subquery network configuration, which is based on the CommonSubqueryNetworkConfig template.
 * @type {IProjectNetworkConfig}
 */
export type SolanaNetworkConfig = IProjectNetworkConfig<ISolanaEndpointConfig>;

/**
 * Represents a Solana project configuration based on the CommonSubqueryProject template.
 * @type {CommonSubqueryProject<SolanaNetworkConfig, SubqlDatasource, RuntimeDatasourceTemplate | CustomDatasourceTemplate>}
 */
export type SolanaProject<DS extends SubqlDatasource = SubqlRuntimeDatasource> = CommonSubqueryProject<
  SolanaNetworkConfig,
  SubqlRuntimeDatasource | DS,
  BaseTemplateDataSource<SubqlRuntimeDatasource> | BaseTemplateDataSource<DS>
>;
