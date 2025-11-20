/**
 * main.js
 * アプリケーションのメインロジック
 */

import { appState, IS_DEV_MODE } from './state.js';
import { logger as baseLogger } from './helpers.js'; 
import {
  initializeUISelectors, initializeUI, showPhase, toggleLoader, showError,
  updateUploadPreview, displayDiagnosisResult, displayProposal, displayGeneratedImage
} from './ui.js';
import {
  requestFirebaseCustomToken, uploadFileToStorage, uploadFileToStorageOnly,
  saveImageToGallery, requestDiagnosis, generateHairstyleImage, refineHairstyleImage,
  saveScreenshotToGallery
} from './api.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- 1. ロガー設定 (スマホデバッグ用) ---
const debugLogContainer = document.createElement('div');
debugLogContainer.style.cssText = 'position:fixed; bottom:0; left:0; width:100%; max-height:150px; overflow-y:scroll; background:rgba(0,0,0,0.8); color:#0f0; font-size:10px; z-index:9999; pointer-events:none; display:none;'; 
document.body.appendChild(debugLogContainer);

const logger = {
    log: (...args) => {
        baseLogger.log(...args);
        // デバッグログが必要な場合はコメントアウトを外す
        // debugLogContainer.style.display = 'block';
        // debugLogContainer.innerHTML += `<div>[LOG] ${args.join(' ')}</div>`;
    },
    error: (...args) => {
        baseLogger.error(...args);
        const msg = args.map(a => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ');
        debugLogContainer.style.display = 'block';
        debugLogContainer.innerHTML += `<div style="color:red">[ERR] ${msg}</div>`;
        showError(`System Error: ${msg}`);
    },
    warn: baseLogger.warn
};

// --- 2. 変数定義 ---
let qs;
let uploadButtons = {};
let nextBtn, prevBtn;
let savePhase4Btn, savePhase5Btn;

// --- 3. メイン処理 ---
// DOMContentLoaded を待たずに実行する関数と、待つ関数を分ける

// 即時実行: LIFF初期化プロセス
const initializeAppProcess = async () => {
    try {
        if (IS_DEV_MODE) {
            logger.log("[Init] Dev Mode: Skipping LIFF.");
            return { profile: { userId: "dev-user", displayName: "Dev User" }, accessToken: "dev-token" };
        }

        if (typeof liff === 'undefined') {
            throw new Error("LIFF SDK not loaded.");
        }

        logger.log(`[Init] Starting LIFF init with ID: ${appState.liffId}`);
        
        // LIFF初期化
        await liff.init({ liffId: appState.liffId });
        
        // ログインチェック
        if (!liff.isLoggedIn()) {
            logger.log("[Init] Not logged in.");
            // YHD-AIの挙動: 未ログインならログイン処理へ
            // LINE内ブラウザでも外部ブラウザでも同様に処理
            liff.login();
            return null; // リダイレクト待ち
        }
        
        // プロファイル取得
        const profile = await liff.getProfile();
        const accessToken = liff.getAccessToken();
        logger.log(`[Init] LIFF Ready. User: ${profile.displayName}`);
        
        return { profile, accessToken };

    } catch (err) {
        logger.error("[Init] LIFF Init Failed:", err);
        throw err;
    }
};

// DOM読み込み後の処理
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // UI初期化
    initializeUISelectors();
    initializeUI();
    
    qs = (selector) => document.querySelector(selector);
    uploadButtons = {
      front: qs("#upload-front-photo"),
      side: qs("#upload-side-photo"),
      back: qs("#upload-back-photo"),
      frontVideo: qs("#upload-front-video"),
      backVideo: qs("#upload-back-video"),
      inspiration: qs("#upload-inspiration-photo"),
    };
    nextBtn = qs("#next-btn");
    prevBtn = qs("#prev-btn");
    savePhase4Btn = qs("#save-phase4-btn");
    savePhase5Btn = qs("#save-phase5-btn");

    // Firebase初期化
    logger.log(`[Main] Initializing Firebase...`);
    const firebaseApp = initializeApp(appState.firebaseConfig);
    appState.firebase.app = firebaseApp;
    appState.firebase.auth = getAuth(firebaseApp);
    appState.firebase.storage = getStorage(firebaseApp);
    appState.firebase.firestore = getFirestore(firebaseApp);

    // URLパラメータチェック
    checkUrlParameters();
    
    // LIFF初期化実行
    const liffResult = await initializeAppProcess();

    if (liffResult) {
        const { profile, accessToken } = liffResult;
        appState.userProfile.userId = profile.userId;

        if (!appState.userProfile.viaAdmin) {
            appState.userProfile.firebaseUid = profile.userId;
            const nameInput = document.querySelector("#display-name");
            if (nameInput) nameInput.value = profile.displayName;
        }

        // Firebase認証
        try {
            const { customToken } = await requestFirebaseCustomToken(accessToken);
            if (customToken) {
                await signInWithCustomToken(appState.firebase.auth, customToken);
                logger.log(`[Auth] Firebase Login Success.`);
            }
        } catch (authError) {
             logger.error("[Auth] Firebase Auth Warning:", authError);
        }
    }

    initializeEventListeners();
    
    toggleLoader(false);
    showPhase(1);
    
  } catch (error) {
    logger.error("[Main] Critical Error:", error);
    showError(`起動エラー: ${error.message}`);
    toggleLoader(false);
  }
});

// --- ヘルパー関数 ---

function checkUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const customerId = params.get('customerId');
    const customerName = params.get('customerName');

    if (customerId) {
        logger.log(`[Main] Admin Mode: ${customerId}`);
        appState.userProfile.viaAdmin = true;
        appState.userProfile.firebaseUid = customerId;
        if (customerName) {
            const nameInput = document.querySelector("#display-name");
            if (nameInput) nameInput.value = decodeURIComponent(customerName);
        }
    }
}

function initializeEventListeners() {
  if(nextBtn) nextBtn.addEventListener("click", handleNextStep);
  if(prevBtn) prevBtn.addEventListener("click", handlePrevStep);
  
  const startBtn = document.querySelector("#start-btn");
  if(startBtn) startBtn.addEventListener("click", () => { appState.currentPhase = 2; showPhase(2); });
  
  const nextToUploadBtn = document.querySelector("#next-to-upload-btn");
  if(nextToUploadBtn) nextToUploadBtn.addEventListener("click", () => { appState.currentPhase = 3; showPhase(3); });
  
  setupUploadListeners();
  
  const requestBtn = document.querySelector("#request-diagnosis-btn");
  if(requestBtn) requestBtn.addEventListener("click", executeDiagnosis);

  const nextToProposalBtn = document.querySelector("#next-to-proposal-btn");
  if(nextToProposalBtn) nextToProposalBtn.addEventListener("click", () => {
      appState.currentPhase = 5;
      showPhase(5);
      displayProposal(appState.aiDiagnosisResult.proposal, appState.inspirationImageUrl);
  });
  
  setupSelectionListeners();
  
  const generateBtn = document.querySelector("#next-to-generate-btn");
  if(generateBtn) generateBtn.addEventListener("click", executeImageGeneration);
  
  setupRefineAndSaveListeners();

  if (savePhase4Btn) savePhase4Btn.addEventListener("click", () => captureAndSave("#phase4 .card", "AI診断結果"));
  if (savePhase5Btn) savePhase5Btn.addEventListener("click", () => captureAndSave("#phase5 .card", "AI提案内容"));
}

// --- 以下、ロジック関数群 (変更なし) ---

async function captureAndSave(selector, title) {
    const element = document.querySelector(selector);
    if (!element) return;
    toggleLoader(true, "保存中...");
    try {
        const canvas = await html2canvas(element, {
            useCORS: true, scale: 2, ignoreElements: (el) => el.classList.contains('no-print') 
        });
        const dataUrl = canvas.toDataURL("image/png");
        await saveScreenshotToGallery(appState.userProfile.firebaseUid, dataUrl, title);
        alert(`${title}を保存しました！`);
    } catch (error) {
        logger.error("Capture failed:", error);
        showError("保存失敗: " + error.message);
    } finally {
        toggleLoader(false);
    }
}

function setupUploadListeners() {
    const handleFile = (type, file, isVideo=false) => {
        if(!file) return;
        const url = URL.createObjectURL(file);
        updateUploadPreview(type, url, isVideo);
        appState.uploadTasks[type] = file;
        checkUploadCompletion();
    };
    Object.keys(uploadButtons).forEach(key => {
        const btn = uploadButtons[key];
        const container = btn.closest('.upload-item') || btn.parentElement; 
        if(!container) return;
        const input = container.querySelector('input[type="file"]');
        if(!input) {
            if(key === 'inspiration') {
                const inp = document.querySelector('#inspiration-image-input');
                if(inp) {
                     btn.addEventListener('click', () => inp.click());
                     inp.addEventListener('change', (e) => handleFile(key, e.target.files[0]));
                }
            }
            return;
        }
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', (e) => {
            const isVideo = key.includes('video');
            handleFile(key, e.target.files[0], isVideo);
        });
    });
    const deleteInspirationBtn = document.querySelector("#inspiration-delete-btn");
    if(deleteInspirationBtn) {
        deleteInspirationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            delete appState.uploadTasks['inspiration'];
            appState.uploadedFileUrls['item-inspiration-photo'] = null;
            appState.inspirationImageUrl = null;
            const preview = document.querySelector("#inspiration-image-preview");
            if(preview) { preview.src = ""; preview.style.display = "none"; }
            document.querySelector("#inspiration-upload-status").textContent = "タップして画像を選択";
        });
    }
}

function checkUploadCompletion() {
    const required = ['front', 'side', 'back', 'frontVideo', 'backVideo'];
    const allSet = required.every(key => appState.uploadTasks[key] || appState.uploadedFileUrls[`item-${key}`]);
    const btn = document.querySelector("#request-diagnosis-btn");
    if(btn) {
        btn.disabled = !allSet;
        btn.classList.toggle("btn-disabled", !allSet);
    }
}

async function executeDiagnosis() {
    toggleLoader(true, "画像をアップロード中...");
    try {
        const uid = appState.userProfile.firebaseUid;
        const tasks = [];
        const keyMap = {
            'front': 'item-front-photo', 'side': 'item-side-photo', 'back': 'item-back-photo',
            'frontVideo': 'item-front-video', 'backVideo': 'item-back-video', 'inspiration': 'item-inspiration-photo'
        };
        for (const [shortKey, file] of Object.entries(appState.uploadTasks)) {
            const storageKey = keyMap[shortKey];
            if(storageKey) {
                tasks.push(
                    uploadFileToStorage(uid, file, storageKey).then(url => {
                        appState.uploadedFileUrls[storageKey] = url;
                        if(shortKey === 'inspiration') appState.inspirationImageUrl = url;
                    })
                );
            }
        }
        await Promise.all(tasks);
        toggleLoader(true, "AIが診断中です...");
        const result = await requestDiagnosis(appState.uploadedFileUrls, appState.userProfile, appState.gender);
        appState.aiDiagnosisResult = result;
        displayDiagnosisResult(result.result, result.proposal);
        appState.currentPhase = 4.2; 
        showPhase(4.2);
    } catch(e) {
        logger.error(e);
        showError("診断エラー: " + e.message);
    } finally {
        toggleLoader(false);
    }
}

function setupSelectionListeners() {
    if(hairstylesContainer) {
        hairstylesContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.style-card');
            if(card) {
                document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                appState.selectedHairstyle = { name: card.dataset.styleName, description: card.dataset.styleDesc };
                checkGenerationReady();
            }
        });
    }
    if(haircolorsContainer) {
        haircolorsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.color-card');
            if(card) {
                document.querySelectorAll('.color-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                appState.selectedHaircolor = { name: card.dataset.colorName, description: card.dataset.colorDesc };
                checkGenerationReady();
            }
        });
    }
}

function checkGenerationReady() {
    const btn = document.querySelector("#next-to-generate-btn");
    if(btn) {
        const ready = appState.selectedHairstyle.name && appState.selectedHaircolor.name;
        btn.disabled = !ready;
        btn.classList.toggle("btn-disabled", !ready);
    }
}

async function executeImageGeneration() {
    toggleLoader(true, "ヘアスタイル画像を生成中...");
    try {
        const result = await generateHairstyleImage(
            appState.uploadedFileUrls['item-front-photo'],
            appState.userProfile.firebaseUid,
            appState.selectedHairstyle.name,
            appState.selectedHairstyle.description,
            appState.selectedHaircolor.name,
            appState.selectedHaircolor.description,
            "", 
            appState.inspirationImageUrl
        );
        appState.generatedImageCache = { base64: result.imageBase64, mimeType: result.mimeType };
        displayGeneratedImage(result.imageBase64, result.mimeType);
        appState.currentPhase = 6.2;
        showPhase(6.2);
    } catch(e) {
        logger.error(e);
        showError("生成エラー: " + e.message);
    } finally {
        toggleLoader(false);
    }
}

function setupRefineAndSaveListeners() {
    const refineBtn = document.querySelector("#refine-image-btn");
    if(refineBtn) {
        refineBtn.addEventListener("click", async () => {
            const text = document.querySelector("#refinement-prompt-input").value;
            if(!text) return;
            toggleLoader(true, "画像を微調整中...");
            try {
                const currentImgData = `data:${appState.generatedImageCache.mimeType};base64,${appState.generatedImageCache.base64}`;
                const result = await refineHairstyleImage(currentImgData, appState.userProfile.firebaseUid, text);
                appState.generatedImageCache = { base64: result.imageBase64, mimeType: result.mimeType };
                displayGeneratedImage(result.imageBase64, result.mimeType);
            } catch(e) {
                showError("微調整エラー: " + e.message);
            } finally {
                toggleLoader(false);
            }
        });
    }
    if(saveButton) {
        saveButton.addEventListener("click", async () => {
            toggleLoader(true, "保存中...");
            try {
                const dataUrl = `data:${appState.generatedImageCache.mimeType};base64,${appState.generatedImageCache.base64}`;
                await saveImageToGallery(
                    appState.userProfile.firebaseUid,
                    dataUrl,
                    appState.selectedHairstyle.name,
                    appState.selectedHaircolor.name,
                    document.querySelector("#refinement-prompt-input").value
                );
                alert("保存しました！");
                if(liff.isInClient()) liff.closeWindow();
            } catch(e) {
                showError("保存エラー: " + e.message);
            } finally {
                toggleLoader(false);
            }
        });
    }
}

function handleNextStep() { 
    if (appState.currentPhase === 2) {
        const nameInput = document.querySelector("#display-name");
        if(nameInput && nameInput.value.trim() === "") {
            alert("お名前を入力してください");
            return;
        }
        appState.currentPhase = 3; 
        showPhase(3); 
    }
}
function handlePrevStep() { 
    if (appState.currentPhase > 1) {
        appState.currentPhase--;
        showPhase(appState.currentPhase);
    }
}