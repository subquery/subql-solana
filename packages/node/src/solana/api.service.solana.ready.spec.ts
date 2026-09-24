// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { waitForConnectionPoolReady } from './api.service.solana';

const CONNECTION_POOL_NOT_READY_ERROR =
  'All endpoints in the pool are either suspended due to rate limits or attempting to reconnect';

describe('waitForConnectionPoolReady', () => {
  it('waits for a worker endpoint registration to complete', async () => {
    const getApi = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error(CONNECTION_POOL_NOT_READY_ERROR);
      })
      .mockReturnValue({});

    await expect(
      waitForConnectionPoolReady(getApi, 100),
    ).resolves.toBeUndefined();

    expect(getApi).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated API errors', async () => {
    const error = new Error('Invalid endpoint configuration');
    const getApi = jest.fn(() => {
      throw error;
    });

    await expect(waitForConnectionPoolReady(getApi, 100)).rejects.toBe(error);
    expect(getApi).toHaveBeenCalledTimes(1);
  });

  it('fails with a useful timeout if no endpoint becomes selectable', async () => {
    const getApi = jest.fn(() => {
      throw new Error(CONNECTION_POOL_NOT_READY_ERROR);
    });

    await expect(waitForConnectionPoolReady(getApi, 15)).rejects.toMatchObject({
      message:
        'Timed out waiting for the Solana API connection pool to become ready',
    });
  });
});
