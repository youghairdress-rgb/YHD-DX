/**
 * main.js
 * [Thomas Edit] 修正版 v5
 * - バグ修正: 画像生成時に currentLevel 等の必須パラメータを確実に渡すように修正
 * - 改善: スクリーンショット保存の安定性向上 (html2canvas設定)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { appState, IS_DEV_MODE, USE_MOCK_AUTH } from './state.js';
import { initializeAppFailure, hideLoadingScreen, setTextContent, compressImage, base64ToBlob, logger } from './helpers.js';
import { 
    changePhase, displayDiagnosisResult, displayProposalResult, checkAllFilesUploaded, 
    checkProposalSelection, 
    displayGeneratedImage, showModal, toggleLoader
} from './ui.js';
import { 
    saveImageToGallery, uploadFileToStorageOnly, requestDiagnosis, generateHairstyleImage, refineHairstyleImage, requestFirebaseCustomToken, saveScreenshotToGallery
} from './api.js';


// --- 1. 起動プロセス ---

const initializeAppProcess = async () => {
    try {
        if (IS_DEV_MODE && USE_MOCK_AUTH) {
            return { profile: { userId: "dev-user", displayName: "Dev User" }, accessToken: "dev-token" };
        }
        if (typeof liff === 'undefined') throw new Error("LIFF SDK not loaded.");
        
        await liff.init({ liffId: appState.liffId });
        if (!liff.isLoggedIn()) {
            liff.login();
            return null;
        }
        return { profile: await liff.getProfile(), accessToken: liff.getAccessToken() };
    } catch (err) {
        console.error("[Init] Failed:", err);
        throw err;
    }
};

document.addEventListener("DOMContentLoaded", async () => {
    const loadTimeout = setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen && loadingScreen.style.display !== 'none') {
            hideLoadingScreen();
            changePhase('phase1');
            alert("起動に時間がかかりました。");
        }
    }, 10000);

    try {
        const app = initializeApp(appState.firebaseConfig);
        appState.firebase = { 
            app, auth: getAuth(app), storage: getStorage(app), firestore: getFirestore(app) 
        };

        const params = new URLSearchParams(window.location.search);
        if (params.get('customerId')) {
            appState.userProfile.viaAdmin = true;
            appState.userProfile.firebaseUid = params.get('customerId');
            appState.userProfile.displayName = decodeURIComponent(params.get('customerName') || "");
        }

        const liffResult = await initializeAppProcess();
        clearTimeout(loadTimeout);

        if (liffResult) {
            if (!appState.userProfile.viaAdmin) {
                appState.userProfile.userId = liffResult.profile.userId;
                appState.userProfile.firebaseUid = liffResult.profile.userId;
                appState.userProfile.displayName = liffResult.profile.displayName;
            }

            try {
                if (IS_DEV_MODE && USE_MOCK_AUTH) {
                    await signInAnonymously(appState.firebase.auth);
                } else {
                    const { customToken } = await requestFirebaseCustomToken(liffResult.accessToken);
                    if (customToken) await signInWithCustomToken(appState.firebase.auth, customToken);
                }
            } catch (e) { console.error("Auth Error:", e); }
        } else {
            return;
        }

        initializeAppUI();
        hideLoadingScreen();

    } catch (error) {
        clearTimeout(loadTimeout);
        initializeAppFailure(error.message);
    }
});


// --- 2. UI & ロジック ---

function initializeAppUI() {
    setupEventListeners();
    setTextContent('display-name', appState.userProfile.displayName || "ゲスト");
    const genderRadio = document.querySelector(`input[name="gender"][value="${appState.gender}"]`);
    if (genderRadio) genderRadio.checked = true;
    changePhase('phase1');
    document.body.style.display = 'block';
}

function setupEventListeners() {
    document.getElementById('start-btn')?.addEventListener('click', () => changePhase('phase2'));
    document.getElementById('next-to-upload-btn')?.addEventListener('click', () => {
        const g = document.querySelector('input[name="gender"]:checked');
        if (g) appState.gender = g.value;
        changePhase('phase3');
    });

    const inspInput = document.getElementById('inspiration-image-input');
    const inspBtn = document.getElementById('inspiration-upload-btn');
    if (inspInput) {
        const trigger = (e) => { e.stopPropagation(); inspInput.click(); };
        document.getElementById('inspiration-upload-container')?.addEventListener('click', trigger);
        if(inspBtn) inspBtn.addEventListener('click', trigger);
        inspInput.addEventListener('change', handleInspirationSelect);
    }
    document.getElementById('inspiration-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation(); handleInspirationDelete();
    });

    document.querySelectorAll('.upload-item').forEach(item => {
        const btn = item.querySelector('button');
        const input = item.querySelector('.file-input');
        if (btn && input) {
            btn.addEventListener('click', (e) => { e.stopPropagation(); if(!btn.disabled) input.click(); });
            input.addEventListener('change', (e) => handleFileSelect(e, item.id, btn));
        }
    });

    document.getElementById('request-diagnosis-btn')?.addEventListener('click', handleDiagnosisRequest);

    document.getElementById('next-to-proposal-btn')?.addEventListener('click', () => {
        displayProposalResult(appState.aiProposal, null, !!appState.inspirationImageUrl);
        changePhase('phase5');
    });

    document.getElementById('move-to-phase6-btn')?.addEventListener('click', () => changePhase('phase6'));

    document.getElementById('generate-image-btn')?.addEventListener('click', handleImageGenerationRequest);
    document.getElementById('refine-image-btn')?.addEventListener('click', handleImageRefinementRequest);
    document.getElementById('save-generated-image-to-db-btn')?.addEventListener('click', handleSaveGeneratedImage);

    document.getElementById('back-to-diagnosis-btn')?.addEventListener('click', () => changePhase('phase4'));
    document.getElementById('back-to-proposal-btn')?.addEventListener('click', () => changePhase('phase5'));
    document.getElementById('close-liff-btn')?.addEventListener('click', () => liff?.closeWindow());

    // ★★★ 修正: スクショボタンのイベントリスナー ★★★
    document.getElementById('save-phase4-btn')?.addEventListener('click', () => captureAndSave("#phase4 .card", "AI診断結果"));
    document.getElementById('save-phase5-btn')?.addEventListener('click', () => captureAndSave("#phase5 .card", "AI提案内容"));
}

// --- Handlers ---

// ★★★ 修正: スクリーンショット保存関数 ★★★
async function captureAndSave(selector, title) {
    const element = document.querySelector(selector);
    if (!element) return;
    toggleLoader(true, "保存中...");
    try {
        // html2canvasの設定を強化
        const canvas = await html2canvas(element, {
            useCORS: true, // 外部画像(CORS)対応
            scale: 2, // 高画質
            allowTaint: true, 
            backgroundColor: "#ffffff", // 背景色指定
            ignoreElements: (el) => el.classList.contains('no-print') 
        });
        const dataUrl = canvas.toDataURL("image/png");
        
        // api.jsの関数を呼ぶ
        await saveScreenshotToGallery(appState.userProfile.firebaseUid, dataUrl, title);
        
        showModal("保存完了", `${title}を保存しました！`);
    } catch (error) {
        console.error("Capture failed:", error);
        showModal("保存失敗", "画面の保存に失敗しました。\n" + error.message);
    } finally {
        toggleLoader(false);
    }
}

async function handleInspirationSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const btn = document.getElementById('inspiration-upload-btn');
    const status = document.getElementById('inspiration-upload-status');
    
    if(status) status.textContent = '処理中...';
    if(btn) btn.disabled = true;

    try {
        const processed = file.type.startsWith('image/') ? await compressImage(file) : file;
        const url = await uploadFileToStorageOnly(appState.userProfile.firebaseUid, processed, 'item-inspiration-photo');
        
        const localUrl = URL.createObjectURL(processed);
        await saveImageToGallery(
            appState.userProfile.firebaseUid, 
            localUrl, 
            'inspiration', 'inspiration', ''
        );
        URL.revokeObjectURL(localUrl);
        
        appState.uploadedFileUrls['item-inspiration-photo'] = url;
        appState.inspirationImageUrl = url;

        document.getElementById('inspiration-image-preview').src = url;
        document.getElementById('inspiration-upload-title').textContent = '選択済み';
        if(status) status.textContent = 'タップして変更';
        document.getElementById('inspiration-delete-btn').style.display = 'inline-block';
        if(btn) { btn.textContent = '変更'; btn.disabled = false; }
    } catch (err) {
        console.error(err);
        showModal("エラー", "アップロード失敗: " + err.message);
        if(btn) btn.disabled = false;
    } finally {
        if(e && e.target) e.target.value = null;
    }
}

function handleInspirationDelete() {
    appState.uploadedFileUrls['item-inspiration-photo'] = null;
    appState.inspirationImageUrl = null;
    document.getElementById('inspiration-image-preview').removeAttribute('src');
    document.getElementById('inspiration-upload-title').textContent = '写真を選択';
    document.getElementById('inspiration-delete-btn').style.display = 'none';
    document.getElementById('inspiration-upload-btn').textContent = '選択';
    document.getElementById('inspiration-image-input').value = null;
}

async function handleFileSelect(e, itemId, btn) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    btn.textContent = '処理中...';
    btn.disabled = true;
    delete appState.uploadedFileUrls[itemId];
    checkAllFilesUploaded(false);

    try {
        const isVideo = itemId.includes('video');
        const processed = (!isVideo && file.type.startsWith('image/')) ? await compressImage(file) : file;
        const url = await uploadFileToStorageOnly(appState.userProfile.firebaseUid, processed, itemId);
        
        appState.uploadedFileUrls[itemId] = url;
        btn.textContent = '完了';
        btn.classList.replace('btn-outline', 'btn-success');
        document.querySelector(`#${itemId} .upload-icon`)?.classList.add('completed');
        
        const allSet = ['item-front-photo','item-side-photo','item-back-photo','item-front-video','item-back-video'].every(k => appState.uploadedFileUrls[k]);
        checkAllFilesUploaded(allSet);
    } catch (err) {
        showModal("エラー", "アップロード失敗: " + err.message);
        btn.textContent = '撮影';
        btn.disabled = false;
    } finally {
        if(e && e.target) e.target.value = null;
    }
}

async function handleDiagnosisRequest() {
    try {
        changePhase('phase3.5');
        const res = await requestDiagnosis(appState.uploadedFileUrls, appState.userProfile, appState.gender);
        
        appState.aiDiagnosisResult = res.result;
        appState.aiProposal = res.proposal;
        displayDiagnosisResult(res.result);
        changePhase('phase4');
    } catch (err) {
        showModal("診断エラー", err.message);
        changePhase('phase3');
    }
}

async function handleImageGenerationRequest() {
    const container = document.querySelector('.generated-image-container');
    const spinner = document.getElementById('refinement-spinner');
    const img = document.getElementById('generated-image');
    const desc = document.getElementById('generated-image-description');

    if(container) container.style.display = 'block';
    if(spinner) spinner.style.display = 'block';
    if(img) img.style.opacity = '0.3';
    if(desc) desc.textContent = "生成中...";

    try {
        const styleSelect = document.querySelector('input[name="style-select"]:checked')?.value;
        const colorSelect = document.querySelector('input[name="color-select"]:checked')?.value;
        const toneSelect = document.getElementById('hair-tone-select')?.value;

        if (!styleSelect || !colorSelect) throw new Error("スタイルとカラーを選択してください。");

        let hName, hDesc, cName, cDesc, recLevel;
        let isUserStyle = false, isUserColor = false, keepStyle = false, keepColor = false;

        if (styleSelect === 'user_request') {
            hName = "ご希望スタイル"; hDesc = "写真から再現"; isUserStyle = true;
        } else if (styleSelect === 'keep_style') {
            hName = "現在の髪型"; hDesc = "維持"; keepStyle = true;
        } else {
            const s = appState.aiProposal.hairstyles[styleSelect];
            hName = s.name; hDesc = s.description;
        }

        if (colorSelect === 'user_request') {
            cName = "ご希望カラー"; cDesc = "写真から再現"; isUserColor = true;
            recLevel = toneSelect || "";
        } else if (colorSelect === 'keep_color') {
            cName = "現在の髪色"; cDesc = "維持"; keepColor = true;
            recLevel = toneSelect || "";
        } else {
            const c = appState.aiProposal.haircolors[colorSelect];
            cName = c.name; cDesc = c.description;
            recLevel = toneSelect || c.recommendedLevel;
        }

        const userReq = document.getElementById('user-requests')?.value || "";
        
        // ★★★ 修正: すべてのパラメータを1つのオブジェクトにまとめる ★★★
        const generationParams = {
            originalImageUrl: appState.uploadedFileUrls['item-front-photo'],
            firebaseUid: appState.userProfile.firebaseUid,
            hairstyleName: hName,
            hairstyleDesc: hDesc,
            haircolorName: cName,
            haircolorDesc: cDesc,
            recommendedLevel: recLevel,
            // ★ 診断結果から現在のレベルを取得して渡す（これが抜けていた！）
            currentLevel: appState.aiDiagnosisResult?.hairCondition?.currentLevel || "Tone 7", 
            userRequestsText: userReq,
            inspirationImageUrl: appState.inspirationImageUrl,
            isUserStyle, isUserColor, 
            hasToneOverride: !!toneSelect, 
            keepStyle, keepColor
        };

        const res = await generateHairstyleImage(generationParams);

        appState.generatedImageDataBase64 = res.imageBase64;
        appState.generatedImageMimeType = res.mimeType;

        displayGeneratedImage(res.imageBase64, res.mimeType, hName, cName, recLevel);
        
        if(spinner) spinner.style.display = 'none';
        if(img) img.style.opacity = '1';

    } catch (err) {
        showModal("生成エラー", err.message);
        if(spinner) spinner.style.display = 'none';
    }
}

async function handleImageRefinementRequest() {
    const input = document.getElementById('refinement-prompt-input');
    if (!input?.value || !appState.generatedImageDataBase64) return;
    
    const img = document.getElementById('generated-image');
    if(img) img.style.opacity = '0.5';

    try {
        const dataUrl = `data:${appState.generatedImageMimeType};base64,${appState.generatedImageDataBase64}`;
        const res = await refineHairstyleImage(dataUrl, appState.userProfile.firebaseUid, input.value);
        
        appState.generatedImageDataBase64 = res.imageBase64;
        appState.generatedImageMimeType = res.mimeType;
        if(img) {
            img.src = `data:${res.mimeType};base64,${res.imageBase64}`;
            img.style.opacity = '1';
        }
        input.value = '';
    } catch (err) {
        showModal("調整エラー", err.message);
        if(img) img.style.opacity = '1';
    }
}

async function handleSaveGeneratedImage() {
    if (!appState.generatedImageDataBase64) return;
    try {
        const blob = base64ToBlob(appState.generatedImageDataBase64, appState.generatedImageMimeType);
        const file = new File([blob], "saved.png", { type: appState.generatedImageMimeType });
        
        await saveImageToGallery(
            appState.userProfile.firebaseUid, 
            URL.createObjectURL(file), 
            "generated_style", "generated_color", ""
        );
        showModal("保存完了", "画像を保存しました！");
    } catch (err) {
        showModal("保存エラー", err.message);
    }
}