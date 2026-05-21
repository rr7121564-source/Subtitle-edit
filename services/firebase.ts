import { User } from "../types";

// Initialize Firebase (Mocked Offline Mode)
let app = null;
let db: any = null;
let auth: any = null;
let isFirebaseEnabled = false;

console.log("Firebase has been fully disabled. SubSwap is running in Offline/Local Mode.");

export { db, auth, isFirebaseEnabled };

export const USER_COLLECTION = 'users';

/**
 * Saves or updates a user locally (Sync is mocked to do nothing)
 */
export const syncUserToCloud = async (user: User) => {
    // No-op (Offline Mode)
    return;
};

/**
 * Fetches user (mocked to offline mode)
 */
export const getUserFromCloud = async (uid: string): Promise<User | null> => {
    return null;
};
