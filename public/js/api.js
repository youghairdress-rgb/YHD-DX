/**
 * api.js
 * バックエンド通信
 */

import { appState } from './state.js';
import { logger } from './helpers.js';

async function fetchApi(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { error: "Network error", message: await response.text() };
    }
    logger.error(`[API] Error:`, errorData);
    throw new Error(errorData.message || "API Error");
  }
  return response.json();
}

export async function requestFirebaseCustomToken(accessToken) {
  if (!appState.apiBaseUrl) throw new Error("API URL undefined");
  const url = `${appState.apiBaseUrl}/createFirebaseCustomToken`;
  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
}

// import互換
export async function initializeLiffAndAuth() { return {}; }

export async function uploadFileToStorage(firebaseUid, file, key) {
  if (!appState.firebase.storage) throw new Error("Storage not initialized");
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;
  const { ref, uploadBytes, getDownloadURL } = appState.firebase.functions.storage;
  
  const storageRef = ref(appState.firebase.storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const url = await getDownloadURL(snapshot.ref);

  appState.uploadedFileUrls[key] = url;
  return url;
}

export async function uploadFileToStorageOnly(storageInstance, firebaseUid, file, key) {
  const storage = storageInstance || appState.firebase.storage;
  const { ref, uploadBytes, getDownloadURL } = appState.firebase.functions.storage;
  
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const url = await getDownloadURL(snapshot.ref);
  
  return { url };
}

export async function saveImageToGallery(firestoreInstance, storageInstance, firebaseUid, file, itemId) {
    const storage = storageInstance || appState.firebase.storage;
    const { ref, uploadBytes, getDownloadURL } = appState.firebase.functions.storage;

    const path = `gallery/${firebaseUid}/${itemId}-${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);
    
    return { url, path };
}

export async function requestAiDiagnosis(data) {
  return fetchApi(`${appState.apiBaseUrl}/requestDiagnosis`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
}

export async function requestImageGeneration(data) {
  return fetchApi(`${appState.apiBaseUrl}/generateHairstyleImage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
}

export async function requestRefinement(data) {
  return fetchApi(`${appState.apiBaseUrl}/refineHairstyleImage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
}