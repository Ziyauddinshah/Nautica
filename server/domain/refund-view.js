/** @file Pure validation and public data rules for refund view. */
export const refundView = (row) =>
  Object.fromEntries(
    [
      'id',
      'status',
      'amount',
      'currency',
      'provider',
      'providerRefundId',
      'processedAt',
      'updatedAt',
      'generation',
      'bankReference',
    ]
      .filter((key) => row?.[key] !== undefined)
      .map((key) => [key, row[key]]),
  );
