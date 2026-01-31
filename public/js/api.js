/**
 * api.js
 * バックエンド (yhd-ai Functions, yhd-db Functions, Firebase Storage) との通信を担当
 * [Thomas Edit] generateHairstyleImageをオブジェクト引数に対応 & パラメータ不足を解消
 */

import { appState } from './state.js';
import { logger } from './helpers.js';
// Firebase Imports
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// --- ユーティリティ ---
async function fetchApi(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let errorData;
    try {
      // Clone response to allow reading text if json fails
      const clone = response.clone();
      try {
        errorData = await response.json();
      } catch (jsonErr) {
        errorData = { error: "Network error", message: await clone.text() };
      }
    } catch (e) {
      errorData = { error: "Network error", message: "Failed to read error response." };
    }
    logger.error(`[API Fetch] Failed ${options.method} ${url}`, { status: response.status, error: errorData });
    throw new Error(errorData.message || errorData.error || "APIリクエストに失敗しました。");
  }
  return response.json();
}

// --- 認証 ---
export async function requestFirebaseCustomToken(accessToken) {
  const authUrl = "https://asia-northeast1-yhd-db.cloudfunctions.net/createFirebaseCustomToken";

  logger.log(`[API] requestFirebaseCustomToken...`);
  return fetchApi(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: accessToken }),
  });
};

// --- ストレージ (yhd-db) ---

// ファイルのみアップロード (Storageのみ)
export async function uploadFileToStorageOnly(firebaseUid, file, key) {
  if (!appState || !appState.firebase.storage) throw new Error("Firebase Storage not initialized.");
  const storage = appState.firebase.storage;
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;

  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
};

// 画像生成結果の保存 (Firestore + Storage)
export async function saveImageToGallery(firebaseUid, dataUrl, styleName, colorName, refineText) {
  if (!appState || !appState.firebase.storage || !appState.firebase.firestore) throw new Error("Firebase not initialized.");

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const path = `users/${firebaseUid}/gallery/gen-${Date.now()}.png`;
  const storageRef = ref(appState.firebase.storage, path);
  await uploadBytes(storageRef, blob);
  const downloadURL = await getDownloadURL(storageRef);

  const galleryCol = collection(appState.firebase.firestore, `users/${firebaseUid}/gallery`);
  const docRef = await addDoc(galleryCol, {
    url: downloadURL,
    storagePath: path,
    styleName: styleName || "",
    colorName: colorName || "",
    refineText: refineText || "",
    type: "generated",
    createdAt: serverTimestamp(),
  });

  return { docId: docRef.id, path: path, url: downloadURL };
};

// スクリーンショット保存用関数
export async function saveScreenshotToGallery(firebaseUid, dataUrl, title) {
  if (!appState || !appState.firebase.storage || !appState.firebase.firestore) throw new Error("Firebase not initialized.");

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const path = `users/${firebaseUid}/gallery/capture-${Date.now()}.png`;
  const storageRef = ref(appState.firebase.storage, path);
  await uploadBytes(storageRef, blob);
  const downloadURL = await getDownloadURL(storageRef);

  const galleryCol = collection(appState.firebase.firestore, `users/${firebaseUid}/gallery`);
  const docRef = await addDoc(galleryCol, {
    url: downloadURL,
    storagePath: path,
    title: title || "スクリーンショット",
    type: "screenshot",
    createdAt: serverTimestamp(),
  });

  return { docId: docRef.id, path: path };
}

// --- AI機能 (YHD-DX Functions) ---

export async function requestDiagnosis(fileUrls, user, gender) {
  const url = `${appState.apiBaseUrl}/requestDiagnosis`;
  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUrls: fileUrls,
      userProfile: { firebaseUid: user.firebaseUid, lineUserId: user.userId },
      gender: gender,
    }),
  });
};

// ★★★ 修正: 引数をオブジェクト1つにまとめて、そのまま送信するように変更 ★★★
export async function generateHairstyleImage(params) {
  const url = `${appState.apiBaseUrl}/generateHairstyleImage`;
  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params), // 受け取ったパラメータをそのまま送る
  });
};

export async function refineHairstyleImage(generatedImageUrl, firebaseUid, refinementText) {
  const url = `${appState.apiBaseUrl}/refineHairstyleImage`;
  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generatedImageUrl, firebaseUid, refinementText }),
  });
};