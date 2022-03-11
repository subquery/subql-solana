// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {ProjectManifestV0_2_0} from '@subql/common';
import {
  SubqlCustomDatasource,
  SubqlCustomHandler,
  SubqlDatasource,
  SubqlDatasourceKind,
  SubqlHandler,
  SubqlMapping,
  SubqlNetworkFilter,
  SubqlRuntimeDatasource,
  SubqlRuntimeHandler,
} from '@subql/types';

export interface SubqlMappingV0_2_0<T extends SubqlHandler> extends SubqlMapping<T> {
  file: string;
}

export type RuntimeDataSourceV0_2_0 = SubqlRuntimeDatasource<SubqlMappingV0_2_0<SubqlRuntimeHandler>>;
export type CustomDatasourceV0_2_0 = SubqlCustomDatasource<
  string,
  SubqlNetworkFilter,
  SubqlMappingV0_2_0<SubqlCustomHandler>
>;

export type SubstrateProjectManifestV0_2_0 = ProjectManifestV0_2_0<SubqlDatasource>;

export function isDatasourceV0_2_0(
  dataSource: SubqlDatasource
): dataSource is RuntimeDataSourceV0_2_0 | CustomDatasourceV0_2_0 {
  return !!(dataSource as RuntimeDataSourceV0_2_0).mapping.file;
}

export function isRuntimeDataSourceV0_2_0(dataSource: SubqlDatasource): dataSource is RuntimeDataSourceV0_2_0 {
  return dataSource.kind === SubqlDatasourceKind.Runtime && isDatasourceV0_2_0(dataSource);
}
