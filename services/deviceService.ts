
// Generates a persistent unique Device ID.
// Unlike fingerprinting, this ID is generated once and stored, ensuring it doesn't change
// if the browser version updates or screen resolution changes.

export const getDeviceFingerprint = async (): Promise<string> => {
  const STORAGE_KEY = 'subswap_device_unique_id_v2';

  // 1. Check if we already have a generated ID
  try {
      const storedId = localStorage.getItem(STORAGE_KEY);
      if (storedId) return storedId;
  } catch (e) {
      console.error("Error reading stored device ID", e);
  }

  // 2. Generate a new robust ID (Random + Timestamp)
  // We don't use hardware characteristics anymore because they are unstable across updates.
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  };

  const uuid = generateUUID().split('-')[0].toUpperCase(); // Shorten for readability
  const timestamp = Date.now().toString(36).toUpperCase();
  const finalId = `DEV-${uuid}-${timestamp}`;

  // 3. Store it persistently
  try {
      localStorage.setItem(STORAGE_KEY, finalId);
  } catch (e) {
      console.error("Error saving device ID", e);
  }
  
  return finalId;
};
