// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {INetworkCommonModule} from '@subql/types-core';
import {Data} from 'ejs';
import {SubqlCustomDatasource, SubqlDatasource, SubqlRuntimeDatasource} from './project';

export interface SolanaNetworkModule
  extends INetworkCommonModule<SubqlDatasource, SubqlRuntimeDatasource, SubqlCustomDatasource> {
  getIDLInterface(projectPath: string, idlFileName: string): unknown; // TODO update return type
}
