// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import '@subql/types-core/dist/global';
import {Rpc} from '@solana/kit';
import {SolanaRpcApi} from '@solana/rpc-api';

declare global {
  const api: undefined;
  const unsafeApi: Rpc<SolanaRpcApi>;
}
