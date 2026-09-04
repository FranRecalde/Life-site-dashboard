import { ReadingCapture, ReadingQueueEntry } from '../../src/types';

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
      deliveryKind: 'reading',
      status: 'claimed',
      claimedAt: deliveryLease?.acquiredAt ?? legacy.updatedAt,
    };
  }
  if (legacy.status === 'delivered') {
    return {
      ...current,
      deliveryKind: 'reading',
      status: 'done',
      claimedAt: undefined,
      doneAt: deliveredAt ?? legacy.updatedAt,
    };
  }
  if (legacy.status === 'needs_attention') {
    return {
      ...current,
      deliveryKind: 'reading',
      status: 'done',
      claimedAt: undefined,
      doneAt: legacy.updatedAt,
    };
  }
  return { ...current, deliveryKind: 'reading' } as ReadingCapture;
}

export function normalizeReadingQueueEntryState(
  entry: ReadingQueueEntry,
): ReadingQueueEntry {
  return entry.deliveryKind === 'generic'
    ? entry
    : normalizeReadingCaptureState(entry);
}
