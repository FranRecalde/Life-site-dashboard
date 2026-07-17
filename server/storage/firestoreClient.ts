import { Firestore } from '@google-cloud/firestore';

let dbInstance: Firestore | null = null;

/**
 * Initializes and returns the Firestore client using Application Default Credentials (ADC).
 * Never requires a hardcoded service account JSON file.
 */
export function getFirestoreClient(): Firestore {
  if (!dbInstance) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID;
    const databaseId = process.env.FIRESTORE_DATABASE_ID;
    dbInstance = new Firestore({
      projectId,
      ...(databaseId ? { databaseId } : {})
    });
  }
  return dbInstance;
}

/**
 * Tests the connectivity to Firestore by running a lightweight metadata/dummy query.
 * Returns true if successful, false or throws if unsuccessful.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const db = getFirestoreClient();
    // A lightweight limit(1) query to a non-existent dummy collection is the safest way to test ADC and connection
    await db.collection('_diagnostic_check').limit(1).get();
    return true;
  } catch (error) {
    console.error('Firestore connection diagnostic failed:', error);
    return false;
  }
}
