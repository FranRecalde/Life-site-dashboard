import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

const CAPTURE_ID_PATTERN = /^reading_[0-9a-f]{32}$/;
const MARKER_SUFFIX = '.delivered';

export function isReadingCaptureId(value: string): boolean {
  return CAPTURE_ID_PATTERN.test(value);
}

export function getReadingDeliveryMarkerDirectory(queueFile: string): string {
  return `${queueFile}.delivery-markers`;
}

function getMarkerPath(queueFile: string, captureId: string): string {
  if (!isReadingCaptureId(captureId)) {
    throw new Error('Invalid Reading Capture marker ID.');
  }
  return path.join(getReadingDeliveryMarkerDirectory(queueFile), `${captureId}${MARKER_SUFFIX}`);
}

export async function createReadingDeliveryMarker(
  queueFile: string,
  captureId: string,
): Promise<void> {
  const directory = getReadingDeliveryMarkerDirectory(queueFile);
  const markerPath = getMarkerPath(queueFile, captureId);
  await fsPromises.mkdir(directory, { recursive: true });
  let handle: fsPromises.FileHandle | undefined;
  try {
    handle = await fsPromises.open(markerPath, 'wx');
    await handle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function hasReadingDeliveryMarker(
  queueFile: string,
  captureId: string,
): Promise<boolean> {
  try {
    await fsPromises.access(getMarkerPath(queueFile, captureId), fs.constants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function listReadingDeliveryMarkerIds(queueFile: string): string[] {
  try {
    return fs.readdirSync(getReadingDeliveryMarkerDirectory(queueFile), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(MARKER_SUFFIX))
      .map((entry) => entry.name.slice(0, -MARKER_SUFFIX.length))
      .filter(isReadingCaptureId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function deleteReadingDeliveryMarker(queueFile: string, captureId: string): void {
  try {
    fs.unlinkSync(getMarkerPath(queueFile, captureId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
