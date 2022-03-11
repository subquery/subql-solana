// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {ProjectManifestV0_2_1} from '@subql/common';
import {SubqlDatasource} from '@subql/types';
import {CustomDatasourceV0_2_0, RuntimeDataSourceV0_2_0} from '../v0_2_0';

export interface DatasourceTemplate {
  name: string;
}

export type RuntimeDatasourceTemplate = RuntimeDataSourceV0_2_0 & DatasourceTemplate;
export type CustomDatasourceTemplate = CustomDatasourceV0_2_0 & DatasourceTemplate;

export type SubstrateProjectManifestV0_2_1 = ProjectManifestV0_2_1<
  RuntimeDatasourceTemplate | CustomDatasourceTemplate,
  SubqlDatasource
>;
