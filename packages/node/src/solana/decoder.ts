// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import fs from 'node:fs';
import { getNodeCodec } from '@codama/dynamic-codecs';
import { Base58EncodedBytes } from '@solana/kit';
import {
  parseIdl,
  Idl,
  isAnchorIdlV01,
  getInstructionDiscriminatorBytes,
  findInstructionDiscriminatorByName,
} from '@subql/common-solana';
import { getLogger } from '@subql/node-core';
import {
  DecodedData,
  SolanaInstruction,
  SolanaLogMessage,
  SubqlDatasource,
} from '@subql/types-solana';
import { isHex } from '@subql/utils';
import bs58 from 'bs58';
import { camelCase, DefinedTypeNode, InstructionNode, RootNode } from 'codama';
import { Memoize } from '../utils/decorators';
import { getProgramId } from './utils.solana';

const logger = getLogger('SolanaDecoder');

function findInstructionForData(
  rootNode: RootNode,
  data: Buffer,
): InstructionNode | undefined {
  return rootNode.program.instructions.find((inst) => {
    try {
      const bytes = getInstructionDiscriminatorBytes(inst);
      return data.indexOf(bytes) === 0;
    } catch (e) {
      logger.debug(
        `Failed to get discriminator for instruction ${inst.name}: ${e}`,
      );
      return false;
    }
  });
}

// Converts a base58 or base64 string to Buffer
function basedToBuffer(input: string | Base58EncodedBytes): Buffer {
  try {
    return bs58.decode(input);
  } catch (e) {
    return Buffer.from(input, 'base64');
  }
}

function decodeData(
  idl: Idl,
  data: Base58EncodedBytes | string,
  getEncodableNode: (
    rootNode: RootNode,
    data: Buffer,
  ) => InstructionNode | DefinedTypeNode | undefined,
): DecodedData | null {
  const root = parseIdl(idl).getRoot();

  const buffer = basedToBuffer(data);

  const node = getEncodableNode(root, buffer);
  if (!node) {
    logger.warn(
      `Failed to find instruction with discriminator in ${root.program.name}`,
    );
    return null;
  }

  try {
    // Path is required to find other defined structs
    const codec = getNodeCodec([root, root.program, node as any]);

    // Strip the discriminator
    const { discriminator, ...decoded } = codec.decode(buffer) as any;

    return {
      data: decoded,
      name: node.name,
    };
  } catch (e) {
    logger.warn(`Failed to decode data name: ${node.name}, error: ${e}`);
    return null;
  }
}

export function decodeInstruction(
  idl: Idl,
  data: Base58EncodedBytes,
): DecodedData | null {
  return decodeData(idl, data, findInstructionForData);
}

// Codama doesn't support Logs so extra work is required to decode logs
export function decodeLog(idl: Idl, message: string): DecodedData | null {
  // Older versions don't support events
  if (!isAnchorIdlV01(idl)) {
    throw new Error('Only Anchor IDL v0.1.0 is supported for decoding logs');
  }

  const msgData = message.replace('Program data: ', '') as any;
  const msgBuffer = basedToBuffer(msgData);

  // Codama doesn't include events so we have to find it manually
  const event = idl.events?.find(
    (e) => msgBuffer.indexOf(Buffer.from(e.discriminator)) === 0,
  );

  if (!event) {
    throw new Error('Unable to find event for log data');
  }

  // Input needs to be without the discriminator because we're just going to decode a type
  const input = msgBuffer
    .subarray(event.discriminator.length)
    .toString('base64');

  return decodeData(idl, input as any, (root, data) => {
    return root.program.definedTypes.find(
      (t) => t.name === event.name || t.name === camelCase(event.name),
    );
  });
}

export class SolanaDecoder {
  idls: Record<string, Idl | null> = {};

  async loadIdls(ds: SubqlDatasource): Promise<void> {
    if (!ds.assets) {
      return;
    }

    for (const [name, { file }] of ds.assets.entries()) {
      try {
        if (this.idls[name]) {
          continue;
        }
        const raw = await fs.promises.readFile(file, { encoding: 'utf8' });
        this.idls[name] = JSON.parse(raw);
        logger.info(`Loaded IDL for ${name}`);
      } catch (e) {
        throw new Error(`Failed to load datasource IDL ${name}:${file}`);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getIdlFromChain(programId: string): Promise<Idl | null> {
    throw new Error('Not implemented: getIdlFromChain');
    // this.idls[programId] ??= await Program.fetchIdl(programId, {
    //   connection: this.api as any,
    // });

    // return this.idls[programId];
  }

  @Memoize()
  parseDiscriminator(input: string, programId: string): Buffer {
    if (isHex(input)) {
      return Buffer.from(input.replace('0x', ''), 'hex');
    }

    const idl = this.idls[programId];
    if (!idl) {
      throw new Error(`Unable to find IDL for program ${programId}`);
    }

    const root = parseIdl(idl).getRoot();

    const discriminator = findInstructionDiscriminatorByName(root, input);

    if (!discriminator) {
      return bs58.decode(input);
    }

    return discriminator;
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

      return decodeInstruction(idl, instruction.data);
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

      return decodeLog(idl, log.message);
    } catch (e) {
      logger.debug(`Failed to decode log: ${e}`);
    }
    return null;
  }
}
