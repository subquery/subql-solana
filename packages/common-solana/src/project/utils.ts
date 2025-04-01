// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  SecondLayerHandlerProcessor,
  SubqlCustomDatasource,
  SubqlDatasource,
  SolanaDatasourceKind,
  SolanaHandlerKind,
  SubqlRuntimeDatasource,
  SecondLayerHandlerProcessorArray,
  SubqlCustomHandler,
  SubqlMapping,
} from '@subql/types-solana';

// Todo, this aligns with cli/src/generate-controller, but we should move this to common in next version
export const DEFAULT_ABI_DIR = '/abis';

export const NOT_NULL_FILTER = '!null';

type DefaultFilter = Record<string, unknown>;

export function isBlockHandlerProcessor<E>(
  hp: SecondLayerHandlerProcessorArray<SolanaHandlerKind, DefaultFilter, unknown>
): hp is SecondLayerHandlerProcessor<SolanaHandlerKind.Block, DefaultFilter, E> {
  return hp.baseHandlerKind === SolanaHandlerKind.Block;
}

export function isTransactionHandlerProcessor<E>(
  hp: SecondLayerHandlerProcessorArray<SolanaHandlerKind, DefaultFilter, unknown>
): hp is SecondLayerHandlerProcessor<SolanaHandlerKind.Transaction, DefaultFilter, E> {
  return hp.baseHandlerKind === SolanaHandlerKind.Transaction;
}

export function isInstructionHandlerProcessor<E>(
  hp: SecondLayerHandlerProcessorArray<SolanaHandlerKind, DefaultFilter, unknown>
): hp is SecondLayerHandlerProcessor<SolanaHandlerKind.Instruction, DefaultFilter, E> {
  return hp.baseHandlerKind === SolanaHandlerKind.Instruction;
}

export function isCustomDs<F extends SubqlMapping<SubqlCustomHandler>>(
  ds: SubqlDatasource
): ds is SubqlCustomDatasource<string, F> {
  return ds.kind !== SolanaDatasourceKind.Runtime && !!(ds as SubqlCustomDatasource<string>).processor;
}

export function isRuntimeDs(ds: SubqlDatasource): ds is SubqlRuntimeDatasource {
  return ds.kind === SolanaDatasourceKind.Runtime;
}
