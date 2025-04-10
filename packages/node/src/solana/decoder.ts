// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import fs from 'node:fs';
import { getNodeCodec } from '@codama/dynamic-codecs';
import { AnchorIdl, rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import {
  getBase16Encoder,
  getBase58Encoder,
  getBase64Encoder,
  getUtf8Encoder,
} from '@solana/codecs-strings';
import { Base58EncodedBytes } from '@solana/kit';
import { getLogger } from '@subql/node-core';
import {
  DecodedData,
  SolanaInstruction,
  SolanaLogMessage,
  SubqlRuntimeDatasource,
} from '@subql/types-solana';
import bs58 from 'bs58';
import {
  BytesValueNode,
  createFromRoot,
  InstructionNode,
  RootNode,
} from 'codama';
import { SolanaApi } from './api.solana';
import { getProgramId } from './utils.solana';

const logger = getLogger('SolanaDecoder');

export function getBytesFromBytesValueNode(node: BytesValueNode): Uint8Array {
  switch (node.encoding) {
    case 'utf8':
      return getUtf8Encoder().encode(node.data) as Uint8Array;
    case 'base16':
      return getBase16Encoder().encode(node.data) as Uint8Array;
    case 'base58':
      return getBase58Encoder().encode(node.data) as Uint8Array;
    case 'base64':
    default:
      return getBase64Encoder().encode(node.data) as Uint8Array;
  }
}

// TODO fill with appropriate type, this could be a codama or anchor IDL
export type Idl = AnchorIdl | RootNode;

function findInstructionNode(
  rootNode: RootNode,
  data: Buffer,
): InstructionNode | undefined {
  return rootNode.program.instructions.find((inst) => {
    const discArg = inst.arguments.find((arg) => arg.name === 'discriminator');
    if (!discArg) return false;

    // TODO what about other types of discriminators or ones that are larger than 1 byte?
    switch (discArg.defaultValue?.kind) {
      case 'numberValueNode':
        return data[0] === discArg.defaultValue.number;
      case 'bytesValueNode': {
        const defaultBytes = getBytesFromBytesValueNode(discArg.defaultValue);
        return data.indexOf(defaultBytes) === 0;
      }
      case undefined:
        break;
      default:
        throw new Error(
          `Unable to handle unknown discriminator type ${discArg.defaultValue?.kind}`,
        );
    }

    return false;
  });
}

function findEventNode(
  rootNode: RootNode,
  data: Buffer,
): InstructionNode | undefined {
  throw new Error('Not implemented');
}

function decodeData(
  idl: Idl,
  data: Base58EncodedBytes,
  getEncodableNode: (
    rootNode: RootNode,
    data: Buffer,
  ) => InstructionNode | undefined,
): DecodedData | null {
  let codama = createFromRoot(rootNodeFromAnchor(idl as AnchorIdl));
  // Check if the idl was an anchor idl
  if (codama.getRoot().program.publicKey === '') {
    codama = createFromRoot(idl as RootNode);
  }

  const root = codama.getRoot();
  const buffer = bs58.decode(data);

  const node = getEncodableNode(root, buffer);
  if (!node) {
    logger.warn(
      `Failed to find instruction with discriminator in ${root.program.name}`,
    );
    return null;
  }

  try {
    // Path is required to find other defined structs
    const codec = getNodeCodec([root, root.program, node]);

    // Strip the discriminator
    const { discriminator, ...data } = codec.decode(buffer) as any;

    return {
      data: data,
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
  return decodeData(idl, data, findInstructionNode);
}

export function decodeLog(idl: Idl, message: string): DecodedData | null {
  const data = message.replace('Program data:', '') as Base58EncodedBytes;
  return decodeData(idl, data, findEventNode);
}

export class SolanaDecoder {
  idls: Record<string, Idl | null> = {};
  // instructionDecoders: Record<string, BorshInstructionCoder> = {};
  // eventDecoders: Record<string, BorshEventCoder> = {};

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

  // eslint-disable-next-line @typescript-eslint/require-await
  async getIdlFromChain(programId: string): Promise<Idl | null> {
    throw new Error('Not implemented');
    // this.idls[programId] ??= await Program.fetchIdl(programId, {
    //   connection: this.api as any,
    // });

    // return this.idls[programId];
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
