// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

// import {Provider} from '@ethersproject/abstract-provider';
// import {JsonRpcProvider} from '@ethersproject/providers';
import '@subql/types-core/dist/global';
import { SolanaRpcApiMainnet } from '@solana/rpc-api';

declare global {
  const api: unknown; // TODO
  const unsafeApi: SolanaRpcApiMainnet;
}
