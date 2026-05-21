import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, updateDoc, query, where, getDocs } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { User } from "../types";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
let app;
let db: any;
let auth: any;
let isFirebaseEnabled = false;

try {
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
        auth = getAuth(app);
        isFirebaseEnabled = true;
        console.log("Firebase Initialized with Project ID:", firebaseConfig.projectId);
    } else {
        console.warn("Firebase Config missing. Running in Offline Mode.");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
    isFirebaseEnabled = false;
}

export { db, auth, isFirebaseEnabled };

export const USER_COLLECTION = 'users';

/**
 * Saves or updates a user in Firestore (Online Sync)
 */
export const syncUserToCloud = async (user: User) => {
    if (!isFirebaseEnabled || !db || !user.uid) return;
    try {
        let syncedUser = { ...user };
        
        // Check size roughly by stringifying
        let userStr = JSON.stringify(syncedUser);
        const MAX_BYTES = 1000000; // ~1MB safety margin
        
        if (userStr.length > MAX_BYTES && syncedUser.exportHistory && syncedUser.exportHistory.length > 0) {
            console.warn(`User document too large (${userStr.length} bytes). Pruning export history...`);
            while (userStr.length > MAX_BYTES && syncedUser.exportHistory.length > 1) {
                syncedUser.exportHistory = syncedUser.exportHistory.slice(0, -1);
                userStr = JSON.stringify(syncedUser);
            }
            
            if (userStr.length > MAX_BYTES && syncedUser.exportHistory.length > 0) {
                syncedUser.exportHistory = syncedUser.exportHistory.map(h => ({ ...h, content: "[Removed due to size limit]" }));
            }
        }

        // Use the uid as the Document ID
        const userRef = doc(db, USER_COLLECTION, syncedUser.uid);
        await setDoc(userRef, syncedUser, { merge: true });
        console.log(`Synced user ${syncedUser.uid} to cloud.`);
    } catch (e: any) {
        console.error("Cloud Sync Error:", e);
        throw e;
    }
};

/**
 * Fetches a user from Firestore by UID
 */
export const getUserFromCloud = async (uid: string): Promise<User | null> => {
    if (!isFirebaseEnabled || !db || !uid) return null;

    try {
        const userRef = doc(db, USER_COLLECTION, uid);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
            return snapshot.data() as User;
        }
        return null;
    } catch (e: any) {
        console.error("Cloud Fetch Error:", e);
        if (e.code === 'permission-denied' || e.code === 'unavailable') {
            throw e;
        }
        return null;
    }
};