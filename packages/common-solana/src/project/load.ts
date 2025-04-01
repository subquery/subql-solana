// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { SolanaProjectManifestVersioned, VersionedProjectManifest } from './versioned';

export function parseSolanaProjectManifest(raw: unknown): SolanaProjectManifestVersioned {
  const projectManifest = new SolanaProjectManifestVersioned(raw as VersionedProjectManifest);
  projectManifest.validate();
  return projectManifest;
}
