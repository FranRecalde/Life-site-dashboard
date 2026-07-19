import { Firestore } from '@google-cloud/firestore';

let dbInstance: Firestore | null = null;
let dbAddress: string | null = null;

/**
 * Initializes Firestore with an explicit project and database address.
 * Credentials still come from ADC, but resource discovery never does.
 */
export function getFirestoreClient(projectId: string, databaseId: string): Firestore {
  if (!projectId || !databaseId) {
    throw new Error('Firestore project and database must be explicitly configured.');
  }

  const requestedAddress = `${projectId}/${databaseId}`;
  if (dbInstance && dbAddress !== requestedAddress) {
    throw new Error('Firestore client was already initialized for a different explicit address.');
  }

  if (!dbInstance) {
    dbInstance = new Firestore({
      projectId,
      databaseId,
    });
    dbAddress = requestedAddress;
  }
  return dbInstance;
}

/**
 * Tests the connectivity to Firestore by running a lightweight metadata/dummy query.
 * Returns true if successful, false or throws if unsuccessful.
 */
export async function testFirestoreConnection(db: Firestore): Promise<boolean> {
  try {
    // A lightweight limit(1) query to a non-existent dummy collection is the safest way to test ADC and connection
    await db.collection('_diagnostic_check').limit(1).get();
    return true;
  } catch {
    console.error('Firestore connection diagnostic failed.');
    return false;
  }
}
