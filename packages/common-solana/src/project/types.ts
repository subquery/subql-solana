// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { IProjectManifest } from '@subql/types-core';
import { SubqlDatasource } from '@subql/types-solana';

// All of these used to be redefined in this file, re-exporting for simplicity
export {
  SubqlRuntimeHandler,
  SubqlCustomHandler,
  SubqlHandler,
  SubqlDatasource as SubqlSolanaDataSource,
  SubqlCustomDatasource as SubqlSolanaCustomDataSource,
  SubqlDatasourceProcessor,
  SubqlHandlerFilter,
} from '@subql/types-solana';

export type ISolanaProjectManifest = IProjectManifest<SubqlDatasource>;

