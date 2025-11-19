/**
 * api.js
 * バックエンド通信
 */

import { appState } from './state.js';
import { logger } from './helpers.js';

/**
 * 汎用APIフェッチ関数
 * @param {string} url - リクエストURL
 * @param {object} options - fetchオプション
 * @return {Promise<object>} - レスポンスJSON
 */
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

/**
 * Firebaseカスタムトークンを取得する (LINE認証用)
 * @param {string} accessToken - LINEアクセストークン
 */
export async function requestFirebaseCustomToken(accessToken) {
  if (!appState.apiBaseUrl) throw new Error("API URL undefined");
  const url = `${appState.apiBaseUrl}/createFirebaseCustomToken`;
  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
}

// import互換用 (実際には main.js で個別に初期化しているため空のオブジェクトを返す)
export async function initializeLiffAndAuth() { return {}; }

/**
 * Storageへのファイルアップロード (古い実装・互換性のため残置)
 */
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

/**
 * Storageへのファイルアップロード (URLのみ返す版)
 * @param {object} storageInstance - Firebase Storageインスタンス
 * @param {string} firebaseUid - ユーザーID
 * @param {File} file - アップロードするファイル
 * @param {string} key - ファイルキー (例: item-front-photo)
 * @param {function} onProgress - 進捗コールバック (任意)
 */
export async function uploadFileToStorageOnly(storageInstance, firebaseUid, file, key, onProgress) {
  const storage = storageInstance || appState.firebase.storage;
  const { ref, uploadBytes, getDownloadURL } = appState.firebase.functions.storage;
  
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  
  // シンプルな実装のため、onProgressはここでは uploadBytes で直接扱わず、呼び出し元でUI制御する想定
  if (onProgress) onProgress();

  const snapshot = await uploadBytes(storageRef, file);
  const url = await getDownloadURL(snapshot.ref);
  
  return { url };
}

/**
 * 画像をGallery用パスに保存し、URLを取得する
 */
export async function saveImageToGallery(firestoreInstance, storageInstance, firebaseUid, file, itemId) {
    const storage = storageInstance || appState.firebase.storage;
    const { ref, uploadBytes, getDownloadURL } = appState.firebase.functions.storage;

    const path = `gallery/${firebaseUid}/${itemId}-${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);
    
    return { url, path };
}

/**
 * AI診断リクエスト (フェーズ4)
 * @param {object} data - リクエストデータ
 * @param {object} data.fileUrls - 画像URLマップ
 * @param {object} data.userProfile - ユーザー情報
 * @param {string} data.gender - 性別
 * @param {string} data.userRequestsText - 要望テキスト (任意)
 */
export async function requestAiDiagnosis(data) {
  // data に userRequestsText が含まれる
  return fetchApi(`${appState.apiBaseUrl}/requestDiagnosis`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
}

/**
 * 画像生成リクエスト (フェーズ6)
 * @param {object} data - リクエストデータ
 * @param {string} data.originalImageUrl - 元画像URL
 * @param {string} data.firebaseUid - ユーザーID
 * @param {string} data.hairstyleName - スタイル名
 * ...他
 * @param {string} data.userRequestsText - 要望テキスト (任意)
 * @param {string} data.inspirationImageUrl - ご希望写真URL (任意)
 */
export async function requestImageGeneration(data) {
  // data に userRequestsText, inspirationImageUrl が含まれる
  return fetchApi(`${appState.apiBaseUrl}/generateHairstyleImage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
}

/**
 * 画像微調整リクエスト (フェーズ6)
 * @param {object} data - リクエストデータ
 * @param {string} data.generatedImageUrl - 元画像のDataURL
 * @param {string} data.refinementText - 指示テキスト
 */
export async function requestRefinement(data) {
  return fetchApi(`${appState.apiBaseUrl}/refineHairstyleImage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
}