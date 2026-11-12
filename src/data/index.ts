import { AppDb } from './db';
import { Repository } from './repository';

/** The app's one database and repository. Tests create their own instead. */
export const db = new AppDb();
export const repo = new Repository(db);

/**
 * Asks the browser to never auto-delete this app's data (Safari may otherwise clear
 * storage of sites not used for a while). Returns whether storage is now persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
