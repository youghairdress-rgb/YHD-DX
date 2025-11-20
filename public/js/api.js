/**
 * api.js
 * バックエンド (yhd-ai Functions, yhd-db Functions, Firebase Storage) との通信を担当
 */

import { appState } from './state.js'; // 修正: state.js からインポート
import { logger } from './helpers.js';

// --- ユーティリティ ---
async function fetchApi(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { error: "Network error", message: await response.text() };
    }
    logger.error(`[API Fetch] Failed ${options.method} ${url}`, { status: response.status, error: errorData });
    throw new Error(errorData.message || errorData.error || "APIリクエストに失敗しました。");
  }
  return response.json();
}

// --- 認証 ---
export async function requestFirebaseCustomToken(accessToken) {
  // yhd-db (管理アプリ) の Functions を使用して認証トークンを作成
  // ※ apiBaseUrl は YHD-DX (AI用) だが、認証は DB側(yhd-db) で行う必要がある
  //   そのため、ここではURLをハードコードするか、yhd-db用のURL定数を持つのが安全です。
  //   現状の構成では YHD-DX にリクエストして YHD-DX の認証を通す形になりますが、
  //   Configが yhd-db なので、本来は yhd-db の createFirebaseCustomToken を叩く必要があります。
  //   一旦、管理アプリと同じURLを指定します。
  const authUrl = "https://asia-northeast1-yhd-db.cloudfunctions.net/createFirebaseCustomToken"; 
  
  logger.log(`[API] requestFirebaseCustomToken...`);
  return fetchApi(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: accessToken }),
  });
};

// --- ストレージ (yhd-db) ---
export async function uploadFileToStorage(firebaseUid, file, key) {
  if (!appState || !appState.firebase.storage) throw new Error("Firebase Storage not initialized.");
  const storage = appState.firebase.storage;
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;
  
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);

  appState.uploadedFileUrls[key] = downloadURL;
  return downloadURL;
};

export async function uploadFileToStorageOnly(firebaseUid, file, key) {
  if (!appState || !appState.firebase.storage) throw new Error("Firebase Storage not initialized.");
  const storage = appState.firebase.storage;
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;

  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
};

// 画像生成結果の保存 (メタデータ付き)
export async function saveImageToGallery(firebaseUid, dataUrl, styleName, colorName, refineText) {
  if (!appState || !appState.firebase.storage || !appState.firebase.firestore) throw new Error("Firebase not initialized.");
  
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const path = `users/${firebaseUid}/gallery/gen-${Date.now()}.png`; // パスを users/{uid}/gallery に修正
  const storageRef = ref(appState.firebase.storage, path);
  await uploadBytes(storageRef, blob);
  const downloadURL = await getDownloadURL(storageRef);

  const galleryCol = collection(appState.firebase.firestore, `users/${firebaseUid}/gallery`); // users/{uid}/gallery に修正
  const docRef = await addDoc(galleryCol, {
    url: downloadURL, // 管理アプリに合わせてキー名を 'url' に統一
    storagePath: path,
    styleName: styleName,
    colorName: colorName,
    refineText: refineText || "",
    type: "generated", // 生成画像
    createdAt: serverTimestamp(),
  });

  return { docId: docRef.id, path: path };
};

// ▼▼▼ 追加: スクリーンショット保存用関数 ▼▼▼
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
    title: title, // "診断結果" などのタイトル
    type: "screenshot", // スクショ
    createdAt: serverTimestamp(),
  });

  return { docId: docRef.id, path: path };
}
// ▲▲▲ 追加ここまで ▲▲▲

// --- AI機能 (YHD-DX Functions) ---
export async function requestDiagnosis(fileUrls, user, gender) {
  const url = `${appState.apiBaseUrl}/requestDiagnosis`; // YHD-DX のURL
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

export async function generateHairstyleImage(originalImageUrl, firebaseUid, hairstyleName, hairstyleDesc, haircolorName, haircolorDesc, userRequestsText, inspirationImageUrl) {
  const url = `${appState.apiBaseUrl}/generateHairstyleImage`; // YHD-DX のURL
  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalImageUrl, firebaseUid, hairstyleName, hairstyleDesc, haircolorName, haircolorDesc, userRequestsText, inspirationImageUrl,
    }),
  });
};

export async function refineHairstyleImage(generatedImageUrl, firebaseUid, refinementText) {
  const url = `${appState.apiBaseUrl}/refineHairstyleImage`; // YHD-DX のURL
  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generatedImageUrl, firebaseUid, refinementText }),
  });
};

// Firebase Imports for internal use
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";