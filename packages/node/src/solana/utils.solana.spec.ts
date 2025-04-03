// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Idl } from '@coral-xyz/anchor';
import { getAnchorDiscriminator } from './utils.solana';

const IDL_Jupiter: Idl = require('../../test/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4.idl.json');

describe('SolanaUtils', () => {
  describe('Calculating discriminators', () => {
    it('correctly calculates an Anchor discriminator from an instruction name', () => {
      for (const inst of IDL_Jupiter.instructions) {
        const discriminator = getAnchorDiscriminator(inst.name);
        expect(discriminator).toEqual(Buffer.from(inst.discriminator));
      }
    });

    it('correctly calculates an Anchor discriminator from a hex discriminator', () => {
      for (const inst of IDL_Jupiter.instructions) {
        const discriminator = getAnchorDiscriminator(
          Buffer.from(inst.discriminator).toString('hex'),
        );
        expect(discriminator).toEqual(Buffer.from(inst.discriminator));
      }
    });

    it('correctly calculates an Anchor discriminator from a event name', () => {
      for (const event of IDL_Jupiter.events!) {
        const discriminator = getAnchorDiscriminator(event.name, 'event');
        expect(discriminator).toEqual(Buffer.from(event.discriminator));
      }
    });
  });
});
