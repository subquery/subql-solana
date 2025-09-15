// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import fs from 'node:fs';
import { getNodeCodec } from '@codama/dynamic-codecs';
import { Base58EncodedBytes, TransactionForFullJson } from '@solana/kit';
import {
  parseIdl,
  Idl,
  isAnchorIdlV01,
  getInstructionDiscriminatorBytes,
  findInstructionDiscriminatorByName,
  getDiscriminator,
  isRootNode,
  isAnchorIdl,
} from '@subql/common-solana';
import { getLogger } from '@subql/node-core';
import {
  DecodedData,
  Decoder,
  SolanaInstruction,
  SolanaLogMessage,
  SubqlDatasource,
} from '@subql/types-solana';
import { isHex } from '@subql/utils';
import bs58 from 'bs58';
import {
  camelCase,
  DefinedTypeNode,
  InstructionNode,
  pascalCase,
  RootNode,
  titleCase,
} from 'codama';
import { Memoize } from '../utils/decorators';
import { allAccounts, getProgramId } from './utils.solana';

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
    return Buffer.from(bs58.decode(input));
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
  const msgData = message.replace('Program data: ', '');
  const msgBuffer = basedToBuffer(msgData);

  // Codama IDL, doesn't include events in the IDL but it should decoded to a definedType in the IDL
  if (!isAnchorIdl(idl)) {
    if (msgBuffer.length < 8) {
      // Not enough data for a discriminator
      return null;
    }

    // Split the discriminator and data
    const logDisc = msgBuffer.subarray(0, 8);
    const data = msgBuffer.subarray(8);

    // Attempt to find the matching type by discriminator and decode the data
    return decodeData(idl, data.toString('base64'), (root) => {
      return root.program.definedTypes.find(
        (t) =>
          // Warning this is fragile as there can be various casings of the type names, but because it requires hashing data we can only go one way
          logDisc.indexOf(getDiscriminator(t.name)) === 0 ||
          logDisc.indexOf(getDiscriminator(pascalCase(t.name))) === 0,
      );
    });
  }

  // Older versions don't support events
  if (!isAnchorIdlV01(idl)) {
    throw new Error('Only Anchor IDL v0.1.0 is supported for decoding logs');
  }

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

  return decodeData(idl, input, (root) => {
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
      return Buffer.from(bs58.decode(input));
    }

    return discriminator;
  }

  async decodeInstructionRaw(
    instruction: TransactionForFullJson<0>['transaction']['message']['instructions'][number],
    transaction: TransactionForFullJson<0>,
  ): Promise<DecodedData | null> {
    try {
      const programId = allAccounts(transaction)[instruction.programIdIndex];

      const idl =
        this.idls[programId] ?? (await this.getIdlFromChain(programId));

      if (!idl) {
        logger.warn(
          `Unable to decode instruction for program: ${programId}. No IDL.`,
        );
        return null;
      }

      return decodeInstruction(idl, instruction.data);
    } catch (e) {
      logger.warn(`Failed to decode instruction: ${e}`);
    }

    return null;
  }

  async decodeInstruction(
    instruction: SolanaInstruction,
  ): Promise<DecodedData | null> {
    return this.decodeInstructionRaw(instruction, instruction.transaction);
  }

  async decodeLog(log: SolanaLogMessage): Promise<DecodedData | null> {
    try {
      const programId = log.programId;

      const idl =
        this.idls[programId] ?? (await this.getIdlFromChain(programId));

      if (!idl) {
        logger.warn(`Unable to decode log for program: ${programId}. No IDL.`);
        return null;
      }

      return decodeLog(idl, log.message);
    } catch (e) {
      logger.warn(`Failed to decode log: ${e}`);
    }
    return null;
  }
}
