// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {BaseDataSource, BlockFilterImpl, forbidNonWhitelisted} from '@subql/common';
import {FileReference} from '@subql/types-core';
import {
  SolanaHandlerKind,
  SolanaDatasourceKind,
  SolanaLogFilter,
  SubqlCustomHandler,
  SubqlMapping,
  SubqlHandler,
  SubqlRuntimeHandler,
  SubqlRuntimeDatasource,
  SubqlCustomDatasource,
  SubqlBlockHandler,
  SubqlTransactionHandler,
  SolanaTransactionFilter,
  SolanaBlockFilter,
  SolanaInstructionFilter,
  SubqlInstructionHandler,
  SubqlLogHandler,
  InstructionAccountFilter,
} from '@subql/types-solana';
import {plainToClass, Transform, Type} from 'class-transformer';
import {IsArray, IsEnum, IsOptional, IsString, IsObject, ValidateNested, Length} from 'class-validator';

export class BlockFilter extends BlockFilterImpl implements SolanaBlockFilter {}

export class TransactionFilter implements SolanaTransactionFilter {
  @IsOptional()
  @IsString()
  signerAccountKey?: string;
}

export class InstructionFilter implements SolanaInstructionFilter {
  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsString()
  discriminator?: string;

  @IsOptional()
  @IsArray()
  @Length(0, 9)
  accounts?: [
    InstructionAccountFilter,
    InstructionAccountFilter?,
    InstructionAccountFilter?,
    InstructionAccountFilter?,
    InstructionAccountFilter?,
    InstructionAccountFilter?,
    InstructionAccountFilter?,
    InstructionAccountFilter?,
    InstructionAccountFilter?
  ];
}

export class LogFilter implements SolanaLogFilter {
  @IsOptional()
  @IsString()
  programId?: string;
}

export class BlockHandler implements SubqlBlockHandler {
  @IsObject()
  @IsOptional()
  @Type(() => BlockFilter)
  filter?: BlockFilter;
  @IsEnum(SolanaHandlerKind, {groups: [SolanaHandlerKind.Block]})
  kind!: SolanaHandlerKind.Block;
  @IsString()
  handler!: string;
}

export class TransactionHandler implements SubqlTransactionHandler {
  @IsOptional()
  @ValidateNested()
  @Type(() => TransactionFilter)
  filter?: SolanaTransactionFilter;
  @IsEnum(SolanaHandlerKind, {groups: [SolanaHandlerKind.Transaction]})
  kind!: SolanaHandlerKind.Transaction;
  @IsString()
  handler!: string;
}

export class InstructionHandler implements SubqlInstructionHandler {
  @IsOptional()
  @ValidateNested()
  @Type(() => InstructionFilter)
  filter?: SolanaInstructionFilter;
  @IsEnum(SolanaHandlerKind, {groups: [SolanaHandlerKind.Instruction]})
  kind!: SolanaHandlerKind.Instruction;
  @IsString()
  handler!: string;
}

export class LogHandler implements SubqlLogHandler {
  @IsOptional()
  @ValidateNested()
  @Type(() => LogFilter)
  filter?: SolanaLogFilter;
  @IsEnum(SolanaHandlerKind, {groups: [SolanaHandlerKind.Log]})
  kind!: SolanaHandlerKind.Log;
  @IsString()
  handler!: string;
}

export class CustomHandler implements SubqlCustomHandler {
  @IsString()
  kind!: string;
  @IsString()
  handler!: string;
  @IsObject()
  @IsOptional()
  filter?: Record<string, unknown>;
}

export class SolanaMapping implements SubqlMapping {
  @Transform((params) => {
    const handlers: SubqlHandler[] = params.value;
    return handlers.map((handler) => {
      switch (handler.kind) {
        case SolanaHandlerKind.Log:
          return plainToClass(LogHandler, handler);
        case SolanaHandlerKind.Instruction:
          return plainToClass(InstructionHandler, handler);
        case SolanaHandlerKind.Transaction:
          return plainToClass(TransactionHandler, handler);
        case SolanaHandlerKind.Block:
          return plainToClass(BlockHandler, handler);
        default:
          throw new Error(`handler ${(handler as any).kind} not supported`);
      }
    });
  })
  @IsArray()
  @ValidateNested()
  handlers!: SubqlHandler[];
  @IsString()
  file!: string;
}

export class CustomMapping implements SubqlMapping<SubqlCustomHandler> {
  @IsArray()
  @Type(() => CustomHandler)
  @ValidateNested()
  handlers!: CustomHandler[];
  @IsString()
  file!: string;
}

export class RuntimeDataSourceBase<M extends SubqlMapping<SubqlRuntimeHandler>>
  extends BaseDataSource
  implements SubqlRuntimeDatasource<M>
{
  @IsEnum(SolanaDatasourceKind, {
    groups: [SolanaDatasourceKind.Runtime],
  })
  kind!: SolanaDatasourceKind.Runtime;
  @Type(() => SolanaMapping)
  @ValidateNested()
  mapping!: M;
  @Type(() => FileReferenceImpl)
  @ValidateNested({each: true})
  @IsOptional()
  idls?: Map<string, FileReference>;
}

export class FileReferenceImpl implements FileReference {
  @IsString()
  file!: string;
}

export class CustomDataSourceBase<K extends string, M extends SubqlMapping = SubqlMapping<SubqlCustomHandler>>
  extends BaseDataSource
  implements SubqlCustomDatasource<K, M>
{
  @IsString()
  kind!: K;
  @Type(() => CustomMapping)
  @ValidateNested()
  mapping!: M;
  @Type(() => FileReferenceImpl)
  @ValidateNested({each: true})
  idls!: Map<string, FileReference>;
  @Type(() => FileReferenceImpl)
  @IsObject()
  processor!: FileReference;
}
