import { ReadingCapture } from '../../src/types';

type LegacyReadingCapture = Omit<ReadingCapture, 'status'> & {
  status: ReadingCapture['status'] | 'in_progress' | 'delivered' | 'needs_attention';
  payloadHash?: string;
  deliveryLease?: {
    acquiredAt?: string;
  };
  deliveredAt?: string;
};

export function normalizeReadingCaptureState(
  capture: ReadingCapture,
): ReadingCapture {
  const legacy = capture as unknown as LegacyReadingCapture;
  const {
    payloadHash: _payloadHash,
    deliveryLease,
    deliveredAt,
    ...current
  } = legacy;

  if (legacy.status === 'in_progress') {
    return {
      ...current,
      status: 'claimed',
      claimedAt: deliveryLease?.acquiredAt ?? legacy.updatedAt,
    };
  }
  if (legacy.status === 'delivered') {
    return {
      ...current,
      status: 'done',
      claimedAt: undefined,
      doneAt: deliveredAt ?? legacy.updatedAt,
    };
  }
  if (legacy.status === 'needs_attention') {
    return {
      ...current,
      status: 'done',
      claimedAt: undefined,
      doneAt: legacy.updatedAt,
    };
  }
  return current as ReadingCapture;
}
