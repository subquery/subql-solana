// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import fs from 'node:fs';
import {
  Program,
  BorshInstructionCoder,
  BorshEventCoder,
  Idl,
} from '@coral-xyz/anchor';
import { getLogger } from '@subql/node-core';
import {
  DecodedData,
  SolanaInstruction,
  SolanaLogMessage,
  SubqlRuntimeDatasource,
} from '@subql/types-solana';
import { SolanaApi } from './api.solana';
import { getProgramId } from './utils.solana';

const logger = getLogger('SolanaDecoder');

export class SolanaDecoder {
  idls: Record<string, Idl | null> = {};
  instructionDecoders: Record<string, BorshInstructionCoder> = {};
  eventDecoders: Record<string, BorshEventCoder> = {};

  constructor(public api: SolanaApi) {}

  async loadIdls(ds: SubqlRuntimeDatasource): Promise<void> {
    if (!ds.idls) {
      return;
    }

    for (const [name, { file }] of ds.idls.entries()) {
      try {
        if (this.idls[name]) {
          continue;
        }
        const raw = await fs.promises.readFile(file, { encoding: 'utf8' });
        this.idls[name] = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Failed to load datasource IDL ${name}:${file}`);
      }
    }
  }

  async getIdlFromChain(programId: string): Promise<Idl | null> {
    this.idls[programId] ??= await Program.fetchIdl(programId, {
      connection: this.api as any,
    });

    return this.idls[programId];
  }

  async decodeInstruction(
    instruction: SolanaInstruction,
  ): Promise<DecodedData | null> {
    try {
      const programId = getProgramId(instruction);

      const idl =
        this.idls[programId] ?? (await this.getIdlFromChain(programId));

      if (!idl) {
        return null;
      }

      const coder =
        this.instructionDecoders[programId] ?? new BorshInstructionCoder(idl);
      const decoded = coder.decode(instruction.data, 'base58');

      return decoded;
    } catch (e) {
      logger.debug(`Failed to decode instruction: ${e}`);
    }

    return null;
  }

  async decodeLog(log: SolanaLogMessage): Promise<DecodedData | null> {
    try {
      const programId = log.programId;

      const idl =
        this.idls[programId] ?? (await this.getIdlFromChain(programId));

      if (!idl) {
        return null;
      }

      const coder = this.eventDecoders[programId] ?? new BorshEventCoder(idl);
      const decoded = coder.decode(log.message.replace('Program data:', ''));

      return decoded;
    } catch (e) {
      logger.debug(`Failed to decode log: ${e}`);
    }
    return null;
  }
}
