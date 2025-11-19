/**
 * main.js
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { appState, IS_DEV_MODE, USE_MOCK_AUTH } from './state.js';
import { initializeAppFailure, hideLoadingScreen, setTextContent, compressImage, base64ToBlob } from './helpers.js';
import { 
    changePhase, displayDiagnosisResult, displayProposalResult, checkAllFilesUploaded, checkProposalSelection, displayGeneratedImage 
} from './ui.js';
import { 
    saveImageToGallery, uploadFileToStorageOnly, requestAiDiagnosis, requestImageGeneration, requestRefinement, requestFirebaseCustomToken 
} from './api.js';

// --- UI Init ---
function initializeAppUI() {
    try {
        setupEventListeners();
        setTextContent('display-name', appState.userProfile.displayName || "ゲスト");
        const genderRadio = document.querySelector(`input[name="gender"][value="${appState.gender}"]`);
        if (genderRadio) genderRadio.checked = true;
        changePhase('phase1');
        if (document.body) document.body.style.display = 'block';
    } catch (err) {
        initializeAppFailure(err.message);
    }
}

// --- Listeners ---
function setupEventListeners() {
    // Phase 1
    document.getElementById('start-btn')?.addEventListener('click', () => changePhase('phase2'));

    // Phase 2: Next Button
    document.getElementById('next-to-upload-btn')?.addEventListener('click', () => {
        const gender = document.querySelector('input[name="gender"]:checked');
        if (gender) appState.gender = gender.value;
        changePhase('phase3');
    });

    // ★★★ Phase 2: Inspiration Photo (ご希望写真) ★★★
    const inspInput = document.getElementById('inspiration-image-input');
    const inspContainer = document.getElementById('inspiration-upload-container');
    const inspBtn = document.getElementById('inspiration-upload-btn');
    const inspDeleteBtn = document.getElementById('inspiration-delete-btn');

    if (inspInput) {
        // 選択トリガー (コンテナ全体 or ボタン)
        const triggerSelect = (e) => {
            // 削除ボタンクリック時は発火させない
            if (e.target === inspDeleteBtn) return;
            inspInput.click();
        };
        if (inspContainer) inspContainer.addEventListener('click', triggerSelect);
        if (inspBtn) inspBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerSelect(e); });

        // ファイル選択時
        inspInput.addEventListener('change', (e) => handleInspirationSelect(e));
    }

    // 削除ボタン
    if (inspDeleteBtn) {
        inspDeleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 親要素への伝播を止める
            handleInspirationDelete();
        });
    }

    // Phase 3 Items (Photo & Video)
    document.querySelectorAll('.upload-item').forEach(item => {
        const btn = item.querySelector('button');
        const input = item.querySelector('.file-input');
        const itemId = item.id;
        
        if (btn && input) {
            btn.addEventListener('click', () => !btn.disabled && input.click());
            input.addEventListener('change', (e) => handleFileSelect(e, itemId, btn));
        }
    });

    // Other Actions
    document.getElementById('request-diagnosis-btn')?.addEventListener('click', handleDiagnosisRequest);
    document.getElementById('next-to-proposal-btn')?.addEventListener('click', () => {
        displayProposalResult(appState.aiProposal, handleProposalSelection);
        changePhase('phase5');
    });
    document.getElementById('next-to-generate-btn')?.addEventListener('click', handleImageGenerationRequest);
    document.getElementById('refine-image-btn')?.addEventListener('click', handleImageRefinementRequest);
    document.getElementById('save-generated-image-to-db-btn')?.addEventListener('click', handleSaveGeneratedImage);
    
    // Navigation
    document.getElementById('back-to-diagnosis-btn')?.addEventListener('click', () => changePhase('phase4'));
    document.getElementById('back-to-proposal-btn')?.addEventListener('click', () => changePhase('phase5'));
    document.getElementById('close-liff-btn')?.addEventListener('click', () => {
        if (liff && liff.closeWindow) liff.closeWindow();
    });
}

// --- Handlers: Inspiration Photo (Phase 2) ---
async function handleInspirationSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert("写真を選択してください");

    const preview = document.getElementById('inspiration-image-preview');
    const title = document.getElementById('inspiration-upload-title');
    const status = document.getElementById('inspiration-upload-status');
    const deleteBtn = document.getElementById('inspiration-delete-btn');
    const uploadBtn = document.getElementById('inspiration-upload-btn');

    // UI更新: アップロード中
    if(status) status.textContent = '処理中...';
    if(uploadBtn) uploadBtn.disabled = true;

    try {
        // 圧縮
        const processedFile = (file.type !== 'image/gif') ? await compressImage(file) : file;
        
        // アップロード (ご希望写真は Storage のみでOKだが、統一して saveImageToGallery でも可)
        // ここではシンプルに Storage のみ保存してURL取得
        const res = await uploadFileToStorageOnly(
            appState.firebase.storage, 
            appState.userProfile.firebaseUid, 
            processedFile, 
            'item-inspiration-photo'
        );

        // State保存
        appState.uploadedFileUrls['item-inspiration-photo'] = res.url;
        appState.inspirationImageUrl = res.url;

        // UI更新: 完了
        if (preview) {
            preview.src = res.url;
            preview.style.display = 'block'; // プレビュー表示
        }
        if (title) title.textContent = '写真を選択済み';
        if (status) status.textContent = 'タップして変更';
        if (deleteBtn) deleteBtn.style.display = 'inline-block';
        if (uploadBtn) {
            uploadBtn.textContent = '変更';
            uploadBtn.disabled = false;
        }

    } catch (err) {
        console.error(err);
        alert("アップロード失敗");
        if(status) status.textContent = 'タップして画像を選択';
        if(uploadBtn) uploadBtn.disabled = false;
    } finally {
        event.target.value = null;
    }
}

function handleInspirationDelete() {
    // Stateクリア
    appState.uploadedFileUrls['item-inspiration-photo'] = null;
    appState.inspirationImageUrl = null;

    // UIクリア
    const preview = document.getElementById('inspiration-image-preview');
    const title = document.getElementById('inspiration-upload-title');
    const status = document.getElementById('inspiration-upload-status');
    const deleteBtn = document.getElementById('inspiration-delete-btn');
    const uploadBtn = document.getElementById('inspiration-upload-btn');
    const input = document.getElementById('inspiration-image-input');

    if (preview) {
        preview.src = '';
        preview.removeAttribute('src'); // アイコン表示に戻すため属性ごと消す
        // CSSで src属性がない場合にアイコンを出すようになっている前提、または style.display制御
        // style.css の記述を見ると `display: block` は `src` ありの場合のみなので、
        // ここでは念のため style.display = 'none' にする（アイコンはCSSで背景等で表示されている場合）
        // もしくは img タグ自体を隠してアイコン用divを出す構成かもしれないが、
        // 現在のCSSでは `#inspiration-image-preview` 自体がアイコンコンテナも兼ねているように見えるため、
        // srcを外せばOK
    }
    if (title) title.textContent = '写真を選択';
    if (status) status.textContent = 'タップして画像を選択';
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (uploadBtn) uploadBtn.textContent = '選択';
    if (input) input.value = null;
}


// --- Handlers: Phase 3 Photo/Video ---
async function handleFileSelect(event, itemId, button) {
    const file = event.target.files?.[0];
    if (!file) return;

    const isVideo = itemId.includes('video');
    const validPhoto = file.type.startsWith('image/');
    const validVideo = file.type.startsWith('video/');

    if (!isVideo && !validPhoto) return alert("写真を選択してください");
    if (isVideo && !validVideo) return alert("動画を選択してください");

    button.textContent = '処理中...';
    button.disabled = true;
    document.querySelector(`#${itemId} .upload-icon`)?.classList.remove('completed');
    
    delete appState.uploadTasks[itemId];
    delete appState.uploadedFileUrls[itemId];
    checkAllFilesUploaded(false);

    try {
        let uploadPromise;

        if (!isVideo) {
            // [写真] 圧縮
            const processedFile = (file.type !== 'image/gif') ? await compressImage(file) : file;
            uploadPromise = saveImageToGallery(
                appState.firebase.firestore, appState.firebase.storage,
                appState.userProfile.firebaseUid, processedFile, itemId
            ).then(res => {
                finishUploadUI(itemId, button, res.url);
                return res;
            });

        } else {
            // [動画]
            const onProgress = () => { button.textContent = '転送中...'; };
            uploadPromise = uploadFileToStorageOnly(
                appState.firebase.storage, appState.userProfile.firebaseUid, file, itemId, onProgress
            ).then(res => {
                finishUploadUI(itemId, button, res.url);
                return res;
            });
        }

        appState.uploadTasks[itemId] = uploadPromise;

    } catch (err) {
        console.error(err);
        alert("アップロード失敗: " + err.message);
        button.textContent = '撮影';
        button.disabled = false;
    } finally {
        event.target.value = null;
    }
}

function finishUploadUI(itemId, button, url) {
    button.textContent = '✔️ 完了';
    button.classList.replace('btn-outline', 'btn-success');
    document.querySelector(`#${itemId} .upload-icon`)?.classList.add('completed');
    appState.uploadedFileUrls[itemId] = url;
    checkAllFilesUploaded(areAllFilesUploaded());
}

// --- Other Handlers (Existing) ---
async function handleDiagnosisRequest() {
    try {
        changePhase('phase3.5');
        await Promise.all(Object.values(appState.uploadTasks));
        const res = await requestAiDiagnosis({
            fileUrls: appState.uploadedFileUrls,
            userProfile: appState.userProfile,
            gender: appState.gender
        });
        appState.aiDiagnosisResult = res.result;
        appState.aiProposal = res.proposal;
        displayDiagnosisResult(res.result);
        changePhase('phase4');
    } catch (err) {
        alert(`診断エラー: ${err.message}`);
        changePhase('phase3');
    }
}

async function handleImageGenerationRequest() {
    try {
        changePhase('phase6');
        const res = await requestImageGeneration({
            originalImageUrl: appState.uploadedFileUrls['item-front-photo'],
            firebaseUid: appState.userProfile.firebaseUid,
            hairstyleName: appState.aiProposal.hairstyles[appState.selectedProposal.hairstyle].name,
            hairstyleDesc: appState.aiProposal.hairstyles[appState.selectedProposal.hairstyle].description,
            haircolorName: appState.aiProposal.haircolors[appState.selectedProposal.haircolor].name,
            haircolorDesc: appState.aiProposal.haircolors[appState.selectedProposal.haircolor].description,
            recommendedLevel: appState.aiProposal.haircolors[appState.selectedProposal.haircolor].recommendedLevel,
            currentLevel: appState.aiDiagnosisResult.hairCondition.currentLevel,
            // ★ 追加: ご希望写真URLと要望テキスト
            userRequestsText: document.getElementById('user-requests')?.value || "",
            inspirationImageUrl: appState.inspirationImageUrl
        });
        
        const dataUrl = `data:${res.mimeType};base64,${res.imageBase64}`;
        appState.generatedImageDataBase64 = res.imageBase64;
        appState.generatedImageMimeType = res.mimeType;
        displayGeneratedImage(res.imageBase64, res.mimeType);

    } catch (err) {
        alert(`生成エラー: ${err.message}`);
        changePhase('phase5');
    }
}

function areAllFilesUploaded() {
    const req = ['item-front-photo', 'item-side-photo', 'item-back-photo', 'item-front-video', 'item-back-video'];
    return req.every(k => appState.uploadedFileUrls[k]);
}
function handleProposalSelection(e) {
    const { type, key } = e.currentTarget.dataset;
    document.querySelectorAll(`.proposal-card[data-type="${type}"]`).forEach(c => c.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
    appState.selectedProposal[type] = key;
    checkProposalSelection(appState.selectedProposal.hairstyle && appState.selectedProposal.haircolor);
}
async function handleImageRefinementRequest() { 
    const input = document.getElementById('refinement-prompt-input');
    if(!input || !input.value) return;
    
    try {
        const generatedImageElement = document.getElementById('generated-image');
        if (generatedImageElement) generatedImageElement.style.opacity = '0.5';
        
        const requestData = {
            generatedImageUrl: appState.generatedImageUrl,
            firebaseUid: appState.userProfile.firebaseUid,
            refinementText: input.value
        };
        const response = await requestRefinement(requestData);
        
        const dataUrl = `data:${response.mimeType};base64,${response.imageBase64}`;
        appState.generatedImageDataBase64 = response.imageBase64;
        appState.generatedImageMimeType = response.mimeType;
        appState.generatedImageUrl = dataUrl;
        
        if (generatedImageElement) generatedImageElement.src = dataUrl;
        input.value = '';
        
    } catch (error) {
        alert(`微調整エラー: ${error.message}`);
    } finally {
        const generatedImageElement = document.getElementById('generated-image');
        if (generatedImageElement) generatedImageElement.style.opacity = '1';
    }
}
async function handleSaveGeneratedImage() {
    if (!appState.generatedImageDataBase64) return;
    try {
        const blob = base64ToBlob(appState.generatedImageDataBase64, appState.generatedImageMimeType);
        const file = new File([blob], "saved_image.png", { type: appState.generatedImageMimeType });
        
        await saveImageToGallery(
            appState.firebase.firestore,
            appState.firebase.storage,
            appState.userProfile.firebaseUid,
            file,
            `favorite_${Date.now()}`
        );
        alert("保存しました！");
    } catch (error) {
        alert(`保存エラー: ${error.message}`);
    }
}

// --- Boot ---
async function main() {
    try {
        const app = initializeApp(appState.firebaseConfig);
        const auth = getAuth(app);
        appState.firebase = { 
            app, auth, storage: getStorage(app), firestore: getFirestore(app),
            functions: { storage: { ref, uploadBytes, getDownloadURL }, firestore: { collection, addDoc, serverTimestamp } }
        };

        if (IS_DEV_MODE && USE_MOCK_AUTH) {
            const cred = await signInAnonymously(auth);
            appState.userProfile.firebaseUid = cred.user.uid;
            appState.userProfile.displayName = "【開発】テスト";
        } else {
            await liff.init({ liffId: appState.liffId });
            if (!liff.isLoggedIn()) { liff.login(); return; }
            const token = await requestFirebaseCustomToken(liff.getAccessToken());
            const cred = await signInWithCustomToken(auth, token.customToken);
            const profile = await liff.getProfile();
            appState.userProfile.firebaseUid = cred.user.uid;
            appState.userProfile.displayName = profile.displayName;
            appState.userProfile.userId = profile.userId;
        }

        const params = new URLSearchParams(location.search);
        if (params.get('customerId')) {
            appState.userProfile.firebaseUid = params.get('customerId');
            appState.userProfile.displayName = params.get('customerName');
            appState.userProfile.viaAdmin = true;
        }

        initializeAppUI();
        hideLoadingScreen();

    } catch (err) {
        initializeAppFailure(err.message);
    }
}
main();