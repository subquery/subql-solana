// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {INetworkCommonModule} from '@subql/types-core';
import {Data} from 'ejs';
import {SubqlCustomDatasource, SubqlDatasource, SubqlRuntimeDatasource} from './project';

export interface SolanaNetworkModule
  extends INetworkCommonModule<SubqlDatasource, SubqlRuntimeDatasource, SubqlCustomDatasource> {
  generateIDLInterfaces(
    datasources: SubqlDatasource[],
    projectPath: string,
    renderTemplate: (templatePath: string, outputPath: string, templateData: Data) => Promise<void>
  ): Promise<void>;
}
