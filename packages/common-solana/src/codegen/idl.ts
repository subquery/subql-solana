// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {AnchorIdl, IdlV01, rootNodeFromAnchor} from '@codama/nodes-from-anchor';
import {getBase16Encoder, getBase58Encoder, getBase64Encoder, getUtf8Encoder} from '@solana/codecs-strings';
import {BytesValueNode, InstructionNode, RootNode, Codama, createFromRoot, camelCase} from 'codama';

export type Idl = AnchorIdl | RootNode;

export function isAnchorIdl(idl: Idl): idl is AnchorIdl {
  return !isRootNode(idl);
}

export function isAnchorIdlV01(idl: Idl): idl is IdlV01 {
  return isAnchorIdl(idl) && (idl.metadata as {spec?: string}).spec === '0.1.0';
}

export function isRootNode(idl: Idl): idl is RootNode {
  return !!(idl as RootNode).program?.publicKey;
}

export function parseIdl(idl: Idl): Codama {
  let codama = createFromRoot(rootNodeFromAnchor(idl as AnchorIdl));
  // Check if the idl was an anchor idl
  if (codama.getRoot().program.publicKey === '') {
    codama = createFromRoot(idl as RootNode);
  }

  return codama;
}

export async function parseIdlFromFile(path: string): Promise<Codama> {
  const idlStr = await fs.promises.readFile(path, 'utf-8');
  const idlJSON = JSON.parse(idlStr);

  return parseIdl(idlJSON);
}

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

export function getInstructionDiscriminatorBytes(node: InstructionNode): Buffer {
  const discArg = node.arguments.find((arg) => arg.name === 'discriminator');
  if (!discArg) {
    throw new Error(`Instruction ${node.name} does not have a discriminator`);
  }

  // TODO what about other types of discriminators or ones that are larger than 1 byte?
  switch (discArg.defaultValue?.kind) {
    case 'numberValueNode':
      return Buffer.from([discArg.defaultValue.number]);
    case 'bytesValueNode':
      return Buffer.from(getBytesFromBytesValueNode(discArg.defaultValue));
    case undefined:
      break;
    default:
      throw new Error(`Unable to handle unknown discriminator type ${discArg.defaultValue?.kind}`);
  }

  throw new Error(`Unable to find discriminator for instruction ${node.name}`);
}

export function findInstructionDiscriminatorByName(rootNode: RootNode, name: string): Buffer | undefined {
  const inst = rootNode.program.instructions.find((inst) => inst.name === name || inst.name === camelCase(name));
  if (!inst) {
    return undefined;
  }

  try {
    return getInstructionDiscriminatorBytes(inst);
  } catch (e) {
    // logger.debug(
    //   `Failed to get discriminator for instruction ${inst.name}: ${e}`,
    // );
    return undefined;
  }
}

// Discriminator are the first 8 bytes of the sha256 over the event's name
export function getDiscriminator(name: string): Uint8Array {
  const hash = createHash('sha256').update(`event:${name}`).digest();
  return new Uint8Array(hash.subarray(0, 8));
}
