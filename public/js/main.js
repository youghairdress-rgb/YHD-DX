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
    displayGeneratedImage, showModal, toggleLoader, drawComposite, resetAdjustments, setupUIListeners, setupFaderButtonListeners
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
    console.log("[main.js] DOMContentLoaded fired");
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
                const performAuth = async () => {
                    if (IS_DEV_MODE && USE_MOCK_AUTH) {
                        await signInAnonymously(appState.firebase.auth);
                    } else {
                        console.log("[main.js] Requesting Custom Token...");
                        const { customToken } = await requestFirebaseCustomToken(liffResult.accessToken);
                        if (customToken) {
                            console.log("[main.js] Signing in with Custom Token...");
                            await signInWithCustomToken(appState.firebase.auth, customToken);
                        }
                    }
                };

                // Timeout Wrapper (4000ms) - Prevent Hang
                const timeoutAuth = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Firebase Auth Timed out")), 4000)
                );

                await Promise.race([performAuth(), timeoutAuth]);
                console.log("[main.js] Auth Completed");

            } catch (e) {
                console.error("[main.js] Auth flow failed or timed out:", e);
                // Proceed anyway - App handles unauth state or retries later
            }
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


// (Function changePhase removed - using imported version from ui.js)
// (Function switchPhase6Tab removed - obsolete)

function initializeAppUI() {
    setupEventListeners();
    setTextContent('display-name', appState.userProfile.displayName || "ゲスト");

    // Set User Greeting for Phase 1
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) {
        const userName = appState.userProfile.displayName || "ゲスト";
        greetingEl.textContent = `ようこそ ${userName} 様！`;
    }

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
        // Check cloud status immediately when entering Phase 3
        checkCloudUploads();
    });

    const inspInput = document.getElementById('inspiration-image-input');
    const inspBtn = document.getElementById('inspiration-upload-btn');
    if (inspInput) {
        const trigger = (e) => { e.stopPropagation(); inspInput.click(); };
        document.getElementById('inspiration-upload-container')?.addEventListener('click', trigger);
        if (inspBtn) inspBtn.addEventListener('click', trigger);
        inspInput.addEventListener('change', handleInspirationSelect);
    }
    document.getElementById('inspiration-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation(); handleInspirationDelete();
    });

    // Phase 3 Viewer Listeners
    document.getElementById('reload-viewer-btn')?.addEventListener('click', checkCloudUploads);
    document.getElementById('request-diagnosis-btn-viewer')?.addEventListener('click', handleDiagnosisRequest);

    // Legacy upload listeners removed/disabled for Phase 3 (kept for Phase 2 inspiration if needed)
    document.querySelectorAll('.upload-item').forEach(item => {
        // Only attach if it's NOT a phase 3 item (though classes might be shared, Phase 3 structure changed)
        if (item.closest('#phase3')) return;

        const btn = item.querySelector('button');
        const input = item.querySelector('.file-input');
        if (btn && input) {
            btn.addEventListener('click', (e) => { e.stopPropagation(); if (!btn.disabled) input.click(); });
            input.addEventListener('change', (e) => handleFileSelect(e, item.id, btn));
        }
    });



    document.getElementById('next-to-proposal-btn')?.addEventListener('click', () => {
        displayProposalResult(appState.aiProposal, null, !!appState.inspirationImageUrl);
        changePhase('phase5');
    });

    document.getElementById('move-to-phase6-btn')?.addEventListener('click', () => {
        changePhase('phase6');
        // No tab switching needed anymore
    });

    // Phase 6 Generation -> Move to Phase 7
    document.getElementById('generate-image-btn')?.addEventListener('click', async () => {
        // Go to Phase 7 first
        changePhase('phase7');
        // Then Start Generation (Async)
        await handleImageGenerationRequest();
    });

    // Phase 6 Tabs - DELETED/OBSOLETE
    // document.getElementById('tab-btn-style')?.addEventListener('click', ...);
    // document.getElementById('tab-btn-composite')?.addEventListener('click', ...);

    // Faders (Direct Input) - Keep existing logic, IDs didn't change (just moved)
    ['range-brightness', 'range-hue', 'range-saturate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Listen to both input (live) and change (commit)
            el.addEventListener('input', () => {
                if (typeof drawComposite === 'function') drawComposite();
            });
            el.addEventListener('change', () => {
                if (typeof drawComposite === 'function') drawComposite();
            });
        }
    });

    // Phase 7 Buttons
    document.getElementById('btn-reset')?.addEventListener('click', () => {
        if (typeof resetAdjustments === 'function') resetAdjustments();
    });

    // document.getElementById('btn-save')?.addEventListener('click', handleSaveGeneratedImage);
    // Note: Save is now handled in ui.js to capture phase6 canvas changes

    document.getElementById('btn-back-style')?.addEventListener('click', () => changePhase('phase6'));

    document.getElementById('refine-image-btn')?.addEventListener('click', handleImageRefinementRequest);
    // save-generated-image-to-db-btn removed/hidden in new UI

    document.getElementById('back-to-diagnosis-btn')?.addEventListener('click', () => changePhase('phase4'));
    document.getElementById('back-to-proposal-btn')?.addEventListener('click', () => changePhase('phase5'));
    document.getElementById('back-to-proposal-btn-p6')?.addEventListener('click', () => changePhase('phase5')); // New button in P6 header
    document.getElementById('close-liff-btn')?.addEventListener('click', () => liff?.closeWindow());

    // ★★★ 修正: スクショボタンのイベントリスナー ★★★
    document.getElementById('save-phase4-btn')?.addEventListener('click', () => captureAndSave("#phase4 .card", "AI診断結果"));
    document.getElementById('save-phase5-btn')?.addEventListener('click', () => captureAndSave("#phase5 .card", "AI提案内容"));

    // ★ Fader Buttons logic
    setupFaderButtonListeners();
}

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
            logging: false, // ログ無効化
            // Huge window height to ensure virtual viewport never clips content
            windowWidth: 1080,
            windowHeight: 8000,
            x: 0,
            y: 0,
            onclone: (clonedDoc) => {
                const clonedElement = clonedDoc.querySelector(selector);

                if (clonedElement) {
                    // 1. Force expand Main Container (Card)
                    // Must use 'important' to override CSS !important
                    clonedElement.style.setProperty('height', 'auto', 'important');
                    clonedElement.style.setProperty('max-height', 'none', 'important');
                    clonedElement.style.setProperty('overflow', 'visible', 'important');
                    clonedElement.style.setProperty('width', '1080px', 'important');
                    clonedElement.style.setProperty('position', 'absolute', 'important');
                    clonedElement.style.setProperty('top', '0', 'important');
                    clonedElement.style.setProperty('left', '0', 'important');

                    // Force Layout Calculation
                    const scrollHeight = clonedElement.scrollHeight;
                    // Try to set min-height to ensure it respects content
                    clonedElement.style.setProperty('min-height', scrollHeight + 'px', 'important');
                }

                // 2. Expand ALL potential scroll containers
                const scrollableClasses = [
                    '.split-container',
                    '.result-grid',
                    '.proposal-grid',
                    '.best-colors-grid',
                    '.makeup-grid',
                    '.top-stylist-comment',
                    '.phase6-layout-grid',
                    '.scroll-y'
                ];
                scrollableClasses.forEach(cls => {
                    const elements = clonedElement.querySelectorAll(cls);
                    elements.forEach(el => {
                        el.style.setProperty('height', 'auto', 'important');
                        el.style.setProperty('max-height', 'none', 'important');
                        el.style.setProperty('overflow', 'visible', 'important');
                        // Ensure it doesn't clip
                        el.style.setProperty('display', 'block', 'important');
                    });
                });

                // 3. Grid specific fix - ensure rows aren't zero height
                const phase5Grid = clonedElement.querySelector('.split-container');
                if (phase5Grid) {
                    phase5Grid.style.setProperty('grid-auto-rows', 'max-content', 'important');
                    phase5Grid.style.setProperty('display', 'grid', 'important');
                    phase5Grid.style.setProperty('overflow', 'visible', 'important');
                }
            },
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
    const preview = document.getElementById('inspiration-image-preview');

    // ★ Immediate Preview (UX Enhancement)
    const localUrl = URL.createObjectURL(file);
    if (preview) preview.src = localUrl;
    const container = document.getElementById('inspiration-upload-container');
    if (container) container.classList.add('has-preview');

    if (status) status.textContent = 'アップロード中...';
    if (btn) btn.disabled = true;
    document.getElementById('inspiration-upload-title').textContent = '写真を選択'; // Keep title valid

    try {
        const processed = file.type.startsWith('image/') ? await compressImage(file) : file;
        const url = await uploadFileToStorageOnly(appState.userProfile.firebaseUid, processed, 'item-inspiration-photo');

        // Note: We already showed the preview. Just update state.
        // We can save the localUrl to gallery too if needed, but we have the remote URL now.

        // Save to Gallery (Background)
        saveImageToGallery(
            appState.userProfile.firebaseUid,
            localUrl, // Using local blob for gallery thumbnail generation speed if applicable? No, API usually needs base64 or blob.
            'inspiration', 'inspiration', ''
        ).catch(e => console.warn("Gallery save background error:", e));

        // Update State
        appState.uploadedFileUrls['item-inspiration-photo'] = url;
        appState.inspirationImageUrl = url;

        // Finalize UI
        if (preview) preview.src = url; // Switch to remote URL to be safe, or keep local? Remote is better for persistence.
        document.getElementById('inspiration-upload-title').textContent = '選択済み';
        if (status) status.textContent = 'タップして変更';
        document.getElementById('inspiration-delete-btn').style.display = 'inline-block';
        if (btn) { btn.textContent = '変更'; btn.disabled = false; }

    } catch (err) {
        console.error(err);
        showModal("エラー", "アップロード失敗: " + err.message);
        if (btn) btn.disabled = false;
        // Revert UI on failure?
        if (status) status.textContent = 'タップして画像を選択';
        if (preview) preview.removeAttribute('src');
        const container = document.getElementById('inspiration-upload-container');
        if (container) container.classList.remove('has-preview');
    } finally {
        if (e && e.target) e.target.value = null;
        // Don't revoke URL immediately if we are using it, but browser handles it eventually.
        // URL.revokeObjectURL(localUrl); logic is tricky if assigned to src.
    }
}

function handleInspirationDelete() {
    appState.uploadedFileUrls['item-inspiration-photo'] = null;
    appState.inspirationImageUrl = null;
    document.getElementById('inspiration-image-preview').removeAttribute('src');
    document.getElementById('inspiration-upload-container').classList.remove('has-preview');
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

        // Save Blob locally for CORS-safe operations
        if (!appState.localBlobs) appState.localBlobs = {};
        appState.localBlobs[itemId] = processed;

        const url = await uploadFileToStorageOnly(appState.userProfile.firebaseUid, processed, itemId);

        appState.uploadedFileUrls[itemId] = url;
        btn.textContent = '完了';
        btn.classList.replace('btn-outline', 'btn-success');
        document.querySelector(`#${itemId} .upload-icon`)?.classList.add('completed');

        const allSet = ['item-front-photo', 'item-side-photo', 'item-back-photo', 'item-front-video', 'item-back-video'].every(k => appState.uploadedFileUrls[k]);
        checkAllFilesUploaded(allSet);
    } catch (err) {
        showModal("エラー", "アップロード失敗: " + err.message);
        btn.textContent = '撮影';
        btn.disabled = false;
    } finally {
        if (e && e.target) e.target.value = null;
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

// --- Phase 3 Viewer Logic ---
async function checkCloudUploads() {
    const uid = appState.userProfile.firebaseUid;
    if (!uid) {
        alert("ユーザIDが不明です。");
        return;
    }

    const items = [
        'item-front-photo', 'item-side-photo', 'item-back-photo',
        'item-front-video', 'item-back-video'
    ];

    // Required items: All photos + videos
    // Map internal IDs to Storage Paths: guest_uploads/{uid}/{itemId}

    let loadedCount = 0;
    const btn = document.getElementById('reload-viewer-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "確認中...";
    }

    for (const itemId of items) {
        const viewId = 'view-' + itemId;
        const viewEl = document.getElementById(viewId);
        if (!viewEl) continue;

        try {
            // Check Guest Uploads First
            const storagePath = `guest_uploads/${uid}/${itemId}`;
            const storageRef = ref(appState.firebase.storage, storagePath);
            const url = await getDownloadURL(storageRef);

            // Success
            appState.uploadedFileUrls[itemId] = url;

            // Update UI
            viewEl.classList.remove('pending');
            viewEl.classList.add('ready');
            viewEl.querySelector('.status-badge').textContent = 'OK';

            const thumb = viewEl.querySelector('.viewer-thumbnail');
            thumb.innerHTML = ''; // Clear icon

            if (itemId.includes('video')) {
                thumb.innerHTML = `<div style="position:absolute;z-index:1">▶️</div><video src="${url}" muted style="width:100%;height:100%;object-fit:cover"></video>`;
            } else {
                thumb.innerHTML = `<img src="${url}" alt="OK">`;
            }
            loadedCount++;

        } catch (e) {
            // Not found or error
            // console.log(`[Check] ${itemId} not found:`, e.code);
            viewEl.classList.remove('ready');
            viewEl.classList.add('pending');
            viewEl.querySelector('.status-badge').textContent = '未アップロード';
        }
    }

    if (btn) {
        btn.disabled = false;
        btn.textContent = "再読み込み";
    }

    const nextBtn = document.getElementById('request-diagnosis-btn-viewer');
    if (nextBtn) {
        if (loadedCount === items.length) {
            nextBtn.disabled = false;
        } else {
            nextBtn.disabled = true;
        }
    }
}

async function handleImageGenerationRequest() {
    // New UI Elements
    const spinner = document.getElementById('loading-screen'); // Use global loader for now
    const img = document.getElementById('main-diagnosis-image');

    // Note: The input area 'generation-config-section' is not hidden by default, so we don't need to 'show' it.
    // We just need to manage the Loading state.

    // Show Global Loader (but keep UI stable)
    if (typeof toggleLoader === 'function') {
        toggleLoader(true, "AIが画像を生成しています...");
    }

    // ★ UX Improvement: Show placeholder (original image) immediately so layout doesn't jump
    const adjustmentContainer = document.getElementById('phase7-adjustment-container');
    const mainDiagnosisImage = document.getElementById('main-diagnosis-image');

    if (adjustmentContainer && mainDiagnosisImage) {
        // Show container
        adjustmentContainer.style.display = 'block';

        // Hide previous canvas if exists (from previous generation)
        const canvas = document.getElementById('phase6-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Set placeholder to original front photo
        if (appState.uploadedFileUrls['item-front-photo']) {
            console.log("[main.js] Setting placeholder. LocalBlob:", !!(appState.localBlobs && appState.localBlobs['item-front-photo']));

            mainDiagnosisImage.onload = () => {
                // Once loaded, try running initial segmentation for "Original" look
                // But only if we are in Phase 7 to avoid background processing
                if (appState.currentPhase === 'phase7') {
                    // Check if ui.js is available via module or global
                    // ensureHairSegmenterLoaded is in ui.js
                }
            };

            // ★ FIX: Reset src to empty first to trigger fresh load
            mainDiagnosisImage.src = "";

            // ★ FIX: Set crossOrigin BEFORE src
            mainDiagnosisImage.setAttribute('crossOrigin', 'anonymous');

            // ★ FIX: Add cache buster to force fresh request with CORS headers
            // This prevents using a cached non-CORS response which causes "Tainted canvases"
            const originalUrl = appState.uploadedFileUrls['item-front-photo'];
            const separator = originalUrl.includes('?') ? '&' : '?';
            mainDiagnosisImage.src = `${originalUrl}${separator}t=${new Date().getTime()}`;

            mainDiagnosisImage.style.display = 'block';
            mainDiagnosisImage.style.filter = 'blur(2px) grayscale(50%)';
        }
    }

    if (img) img.style.opacity = '1.0'; // Don't use simple opacity if we are using the above logic

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

        const generationParams = {
            originalImageUrl: appState.uploadedFileUrls['item-front-photo'],
            firebaseUid: appState.userProfile.firebaseUid,
            hairstyleName: hName,
            hairstyleDesc: hDesc,
            haircolorName: cName,
            haircolorDesc: cDesc,
            recommendedLevel: recLevel,
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

        if (img) img.style.opacity = '1';

    } catch (err) {
        showModal("生成エラー", err.message);
        // Error handling: ensuring UI is usable
        if (img) img.style.opacity = '1';
    } finally {
        if (typeof toggleLoader === 'function') {
            toggleLoader(false);
        }
    }
}

async function handleImageRefinementRequest() {
    const input = document.getElementById('refinement-prompt-input');
    if (!input?.value || !appState.generatedImageDataBase64) return;

    const img = document.getElementById('generated-image');
    if (img) img.style.opacity = '0.5';

    try {
        const dataUrl = `data:${appState.generatedImageMimeType};base64,${appState.generatedImageDataBase64}`;
        const res = await refineHairstyleImage(dataUrl, appState.userProfile.firebaseUid, input.value);

        appState.generatedImageDataBase64 = res.imageBase64;
        appState.generatedImageMimeType = res.mimeType;
        if (img) {
            img.src = `data:${res.mimeType};base64,${res.imageBase64}`;
            img.style.opacity = '1';
        }
        input.value = '';
    } catch (err) {
        showModal("調整エラー", err.message);
        if (img) img.style.opacity = '1';
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