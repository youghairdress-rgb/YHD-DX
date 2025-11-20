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
    changePhase, displayDiagnosisResult, displayProposalResult, checkAllFilesUploaded, checkProposalSelection, displayGeneratedImage,
    showModal // Phase 4: カスタムモーダル
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
    
    // ★ 提案表示時にご希望写真の有無を渡す
    document.getElementById('next-to-proposal-btn')?.addEventListener('click', () => {
        displayProposalResult(
            appState.aiProposal, 
            handleProposalSelection, 
            !!appState.inspirationImageUrl // 第3引数
        );
        changePhase('phase5');
    });

    // ★追加: トーン選択のイベントリスナー
    const toneSelect = document.getElementById('hair-tone-select');
    if (toneSelect) {
        toneSelect.addEventListener('change', (e) => {
            appState.selectedProposal.hairTone = e.target.value;
        });
    }

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
    // Phase 4: カスタムモーダルに変更
    if (!file.type.startsWith('image/')) return showModal("エラー", "写真を選択してください");

    const preview = document.getElementById('inspiration-image-preview');
    const title = document.getElementById('inspiration-upload-title');
    const status = document.getElementById('inspiration-upload-status');
    const deleteBtn = document.getElementById('inspiration-delete-btn');
    const uploadBtn = document.getElementById('inspiration-upload-btn');

    // UI更新: アップロード中
    if(status) status.textContent = '処理中...';
    if(uploadBtn) uploadBtn.disabled = true;

    try {
        // 圧縮 (Phase 3で最適化済み)
        const processedFile = (file.type !== 'image/gif') ? await compressImage(file) : file;
        
        // アップロード (Galleryパスに保存して永続化)
        const res = await saveImageToGallery(
            appState.firebase.firestore, appState.firebase.storage,
            appState.userProfile.firebaseUid, processedFile, 'item-inspiration-photo'
        );

        // State保存
        appState.uploadedFileUrls['item-inspiration-photo'] = res.url;
        appState.inspirationImageUrl = res.url;

        // UI更新: 完了
        if (preview) {
            preview.src = res.url;
            // preview.style.display = 'block'; 
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
        // Phase 4: カスタムモーダルに変更
        showModal("アップロード失敗", "画像のアップロードに失敗しました。\n時間をおいて再度お試しください。");
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
        preview.removeAttribute('src'); // アイコン表示に戻す
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

    // Phase 4: カスタムモーダルに変更
    if (!isVideo && !validPhoto) return showModal("エラー", "写真を選択してください");
    if (isVideo && !validVideo) return showModal("エラー", "動画を選択してください");

    button.textContent = '処理中...';
    button.disabled = true;
    document.querySelector(`#${itemId} .upload-icon`)?.classList.remove('completed');
    
    delete appState.uploadTasks[itemId];
    delete appState.uploadedFileUrls[itemId];
    checkAllFilesUploaded(false);

    try {
        let uploadPromise;

        if (!isVideo) {
            // [写真] 圧縮 (Phase 3で最適化済み)
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
        // Phase 4: カスタムモーダルに変更
        showModal("アップロード失敗", "ファイルのアップロードに失敗しました。\n" + err.message);
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
        
        // Phase 2 カウンセリングデータを送信
        const diagnosisData = {
            fileUrls: appState.uploadedFileUrls,
            userProfile: appState.userProfile,
            gender: appState.gender,
            userRequestsText: document.getElementById('user-requests')?.value || "",
        };

        const res = await requestAiDiagnosis(diagnosisData);
        appState.aiDiagnosisResult = res.result;
        appState.aiProposal = res.proposal;
        displayDiagnosisResult(res.result);
        changePhase('phase4');
    } catch (err) {
        // Phase 4: カスタムモーダルに変更
        showModal("診断エラー", `AI診断中にエラーが発生しました。\n${err.message}`);
        changePhase('phase3');
    }
}

async function handleImageGenerationRequest() {
    try {
        changePhase('phase6');

        // ★ 修正: 「ご希望」および「トーン選択」が選ばれている場合のパラメータ設定
        let hairstyleName, hairstyleDesc, haircolorName, haircolorDesc, recommendedLevel;
        const isUserStyle = appState.selectedProposal.hairstyle === 'user_request';
        const isUserColor = appState.selectedProposal.haircolor === 'user_request';
        const selectedTone = appState.selectedProposal.hairTone; // 選択されたトーン

        if (isUserStyle) {
            hairstyleName = "ご希望のヘアスタイル";
            hairstyleDesc = "アップロードされた写真を参考に再現";
        } else {
            const style = appState.aiProposal.hairstyles[appState.selectedProposal.hairstyle];
            hairstyleName = style.name;
            hairstyleDesc = style.description;
        }

        if (isUserColor) {
            haircolorName = "ご希望のヘアカラー";
            haircolorDesc = "アップロードされた写真を参考に再現";
            // ご希望カラーの場合でも、トーン指定があればそれを優先、なければAIお任せ
            recommendedLevel = selectedTone ? selectedTone : ""; 
        } else {
            const color = appState.aiProposal.haircolors[appState.selectedProposal.haircolor];
            haircolorName = color.name;
            haircolorDesc = color.description;
            // トーン指定があればそれを優先、なければAI提案のレベル
            recommendedLevel = selectedTone ? selectedTone : color.recommendedLevel;
        }

        // ★ 表示用のトーンレベルを抽出 (例: "Tone 11" または "トーン11" を含む場合)
        let displayTone = recommendedLevel;
        // 単純な正規表現で "Tone 数字" を抽出
        const toneMatch = recommendedLevel.match(/(Tone\s?\d+)/i);
        if (toneMatch) {
             displayTone = toneMatch[1]; // "Tone 11"
        } else if (!selectedTone) {
             // AI提案そのままで "Tone X" 形式でない場合（初期プロンプトなど）、適宜表示
             displayTone = "AI推奨トーン";
        }


        // Phase 2 カウンセリングデータを送信
        const generationData = {
            originalImageUrl: appState.uploadedFileUrls['item-front-photo'],
            firebaseUid: appState.userProfile.firebaseUid,
            hairstyleName: hairstyleName,
            hairstyleDesc: hairstyleDesc,
            haircolorName: haircolorName,
            haircolorDesc: haircolorDesc,
            recommendedLevel: recommendedLevel,
            currentLevel: appState.aiDiagnosisResult.hairCondition.currentLevel,
            userRequestsText: document.getElementById('user-requests')?.value || "", 
            inspirationImageUrl: appState.uploadedFileUrls['item-inspiration-photo'] || null, 
            isUserStyle: isUserStyle,
            isUserColor: isUserColor,
            hasToneOverride: !!selectedTone
        };

        const res = await requestImageGeneration(generationData);
        
        // Base64データの管理
        appState.generatedImageDataBase64 = res.imageBase64;
        appState.generatedImageMimeType = res.mimeType;
        
        // ★ 修正: 表示用関数に詳細情報を渡す
        displayGeneratedImage(
            res.imageBase64, 
            res.mimeType, 
            hairstyleName, 
            haircolorName, 
            displayTone // 抽出したトーンレベル
        );

    } catch (err) {
        // Phase 4: カスタムモーダルに変更
        showModal("生成エラー", `画像生成中にエラーが発生しました。\n${err.message}`);
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
    
    if (!appState.generatedImageDataBase64) {
        // Phase 4: カスタムモーダルに変更
        showModal("エラー", "微調整の元になる画像がありません。");
        return;
    }
    
    try {
        const generatedImageElement = document.getElementById('generated-image');
        if (generatedImageElement) generatedImageElement.style.opacity = '0.5';
        
        // Base64データをDataURLとして送信
        const dataUrl = `data:${appState.generatedImageMimeType};base64,${appState.generatedImageDataBase64}`;

        const requestData = {
            generatedImageUrl: dataUrl, 
            firebaseUid: appState.userProfile.firebaseUid,
            refinementText: input.value
        };
        const response = await requestRefinement(requestData);
        
        const dataUrlNew = `data:${response.mimeType};base64,${response.imageBase64}`;
        appState.generatedImageDataBase64 = response.imageBase64;
        appState.generatedImageMimeType = response.mimeType;
        
        if (generatedImageElement) generatedImageElement.src = dataUrlNew;
        input.value = '';
        
    } catch (error) {
        // Phase 4: カスタムモーダルに変更
        showModal("微調整エラー", `画像の微調整中にエラーが発生しました。\n${error.message}`);
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
        // Phase 4: カスタムモーダルに変更
        showModal("保存完了", "画像を保存しました！\nLINEアプリのアルバム等をご確認ください。");
    } catch (error) {
        // Phase 4: カスタムモーダルに変更
        showModal("保存エラー", `画像の保存に失敗しました。\n${error.message}`);
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