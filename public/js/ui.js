/**
 * ui.js
 * DOM操作と画面描画ロジック
 * [Update] UX強化: 処理状況を実況するスマートローダー機能を追加
 */

import { escapeHtml, createResultItem, setTextContent } from './helpers.js';
import { appState } from './state.js';
import { saveImageToGallery } from './api.js';


// --- ★ UX演出用定数・変数 ★ ---

let loaderInterval = null;

export const diagnosisSteps = [
    "AIが顔の輪郭をスキャンしています...",
    "骨格の比率を計算中...",
    "肌のベースカラーを分析しています...",
    "髪のダメージレベルを測定中...",
    "あなたに最適なスタイルを検索中..."
];

export const generationSteps = [
    "ライティング環境を解析中...",
    "髪の毛一本一本を描画しています...",
    "顔の陰影と髪を馴染ませています...",
    "8K解像度で仕上げています..."
];

// --- ★ Phase 6 Adjustment Logic ★ ---
// --- ★ Phase 6 Adjustment Logic (Hair Only) ★ ---
import { ImageSegmenter, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/+esm";

let phase6AdjustmentsInitialized = false;
let imageSegmenter = null;
let hairSegmenterLoading = false;
let hairMaskCanvas = null; // Canvas to hold the generated mask
let originalImageBitmap = null; // Store original for fast redrawing
let phase6Canvas = null; // Phase 6 Canvas (Module Scope)

// 1. Initialize Segmenter (Lazy Load)
async function ensureHairSegmenterLoaded() {
    if (imageSegmenter || hairSegmenterLoading) return;
    hairSegmenterLoading = true;
    console.log("[ui.js] Loading MediaPipe Hair Segmenter...");

    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
                delegate: "CPU" // Changed from GPU to CPU for better iOS stability
            },
            outputCategoryMask: true,
            outputConfidenceMasks: false
        });
        console.log("[ui.js] Hair Segmenter Loaded!");
    } catch (e) {
        console.error("[ui.js] Failed to load Hair Segmenter:", e);
    } finally {
        hairSegmenterLoading = false;
    }
}

export async function initializePhase6Adjustments() {
    console.log("[ui.js] initializePhase6Adjustments called (Phase 7 Setup)");

    // Start loading model immediately
    ensureHairSegmenterLoaded();

    // 1. Setup Canvas & Image
    const imgElement = document.getElementById('main-diagnosis-image');
    if (imgElement) {
        imgElement.crossOrigin = "anonymous";
        imgElement.style.display = 'block';
    }

    // Create or Get Canvas
    phase6Canvas = document.getElementById('phase6-canvas');
    if (!phase6Canvas) {
        phase6Canvas = document.createElement('canvas');
        phase6Canvas.id = 'phase6-canvas';
        phase6Canvas.style.width = '100%';
        phase6Canvas.style.height = '100%';
        phase6Canvas.style.objectFit = 'cover';
        phase6Canvas.style.borderRadius = '8px'; // Updated from 15px to 8px to match CSS

        if (imgElement && imgElement.parentNode) {
            imgElement.parentNode.appendChild(phase6Canvas);
        }
    }

    // 2. Setup Manual Analysis Trigger (Moved from top-level)
    const container = document.getElementById('phase7-adjustment-container');
    const controls = container ? container.querySelector('.adjustment-controls') : null;

    if (container && controls) {
        // Create or Get Button
        let analyzeBtn = document.getElementById('btn-analyze-hair');
        if (!analyzeBtn) {
            analyzeBtn = document.createElement('button');
            analyzeBtn.id = 'btn-analyze-hair';
            container.insertBefore(analyzeBtn, controls);
        }

        // Apply Styles
        analyzeBtn.className = 'btn-primary';
        analyzeBtn.textContent = '髪のトーン調整を開始';
        analyzeBtn.style.marginTop = '15px';
        analyzeBtn.style.width = '100%';
        analyzeBtn.style.marginBottom = '20px';
        analyzeBtn.style.display = 'block';
        analyzeBtn.disabled = false;

        // Hide Faders Initially
        controls.style.display = 'none';

        // Button Click Handler
        analyzeBtn.onclick = async () => {
            const img = document.getElementById('main-diagnosis-image');
            if (!img) return;

            analyzeBtn.disabled = true;
            analyzeBtn.textContent = '髪の毛を分析中...';

            // Run Segmentation (Assumed defined in file)
            if (typeof runHairSegmentation === 'function') {
                await runHairSegmentation(img);
            } else {
                console.error("runHairSegmentation not found");
                analyzeBtn.textContent = 'エラー';
            }

            // On Success (Check if mask created)
            if (hairMaskCanvas) {
                analyzeBtn.textContent = '分析完了（調整モード）';
                analyzeBtn.style.display = 'block';
                analyzeBtn.style.background = '#666';

                controls.style.display = 'flex'; // Show faders
                drawComposite();
            } else {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = '分析失敗（再試行）';
            }
        };
    }
}

// --- Manual Analysis Trigger Logic ---
// MOVED TO initializePhase6Adjustments within Phase 7 logic.
// Please ensure 'runHairSegmentation' is defined or imported if used.

// Export helper for resetting sliders
export function resetAdjustments() {
    const rBrightness = document.getElementById('range-brightness');
    const rHue = document.getElementById('range-hue');
    const rSaturate = document.getElementById('range-saturate');

    if (rBrightness) { rBrightness.value = 10; document.getElementById('label-brightness').textContent = 10; }
    if (rHue) { rHue.value = 180; document.getElementById('label-hue').textContent = '180°'; }
    if (rSaturate) { rSaturate.value = 0; document.getElementById('label-saturate').textContent = '0%'; }

    drawComposite();
}

// Helper: Draw Result (Advanced Hair Coloring)
export function drawComposite() {
    // Dynamic Element Lookup to avoid stale closures
    const rBrightness = document.getElementById('range-brightness');
    const rHue = document.getElementById('range-hue');
    const rSaturate = document.getElementById('range-saturate');
    const canvas = document.getElementById('phase6-canvas');

    // Use originalImageBitmap (the sanitized canvas) which is guaranteed to have data
    if (!canvas || !originalImageBitmap || !hairMaskCanvas || !rBrightness) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 1. Draw Base (Original Image)
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(originalImageBitmap, 0, 0, width, height);

    // Parameters
    const bVal = parseInt(rBrightness.value);
    const hVal = parseInt(rHue.value);
    const sVal = parseInt(rSaturate.value);

    // --- Create Hair Layer (Offscreen) ---
    if (!window.offscreenCanvas) {
        window.offscreenCanvas = document.createElement('canvas');
    }
    window.offscreenCanvas.width = width;
    window.offscreenCanvas.height = height;
    const oCtx = window.offscreenCanvas.getContext('2d');

    // Step A: Draw Pre-Clipped Hair Layer
    oCtx.clearRect(0, 0, width, height);
    oCtx.drawImage(hairMaskCanvas, 0, 0, width, height);

    // Step B: Apply Tone (Brightness)
    oCtx.save();
    oCtx.globalCompositeOperation = 'source-atop'; // Only paint on existing hair pixels

    if (bVal < 10) {
        // Darken
        oCtx.fillStyle = `rgba(0,0,0, ${1 - (bVal / 10)})`;
        oCtx.fillRect(0, 0, width, height);
    } else {
        // Lighten
        const lift = (bVal - 10) / 10;
        oCtx.fillStyle = `rgba(255, 255, 240, ${lift * 0.8})`;
        oCtx.globalCompositeOperation = 'soft-light';
        oCtx.fillRect(0, 0, width, height);

        if (bVal > 15) {
            oCtx.globalCompositeOperation = 'screen';
            oCtx.fillStyle = `rgba(255, 255, 255, ${(bVal - 15) / 10})`;
            oCtx.fillRect(0, 0, width, height);
        }
    }
    oCtx.restore();

    // Step C: Apply Tint (Color)
    if (sVal > 0) {
        oCtx.save();
        const tintColor = `hsl(${hVal}, 100%, 50%)`;
        const intensity = sVal / 100;

        oCtx.globalCompositeOperation = 'color';
        oCtx.fillStyle = tintColor;
        oCtx.globalAlpha = Math.min(1.0, intensity);
        oCtx.fillRect(0, 0, width, height);

        if (intensity > 1.0) {
            oCtx.globalCompositeOperation = 'overlay';
            oCtx.fillStyle = tintColor;
            oCtx.globalAlpha = (intensity - 1.0) * 0.5;
            oCtx.fillRect(0, 0, width, height);
            oCtx.restore();
        }
    } // End of sVal > 0 block

    // --- CRITICAL FIX: Clip everything back to hair mask ---
    // This ensures that any "flooding" from blend modes (like 'color' or 'soft-light')
    // is strictly cut away, leaving only the hair region.
    oCtx.save();
    oCtx.globalCompositeOperation = 'destination-in';
    oCtx.drawImage(hairMaskCanvas, 0, 0, width, height);
    oCtx.restore();

    // 4. Composite Layer onto Main Canvas
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(window.offscreenCanvas, 0, 0);
}

window.applyLiveFilters = drawComposite;

// Event Listeners (Attach only if not already attached? No, safe to re-attach or overwrite)
function onInput() {
    const rb = document.getElementById('range-brightness');
    const rh = document.getElementById('range-hue');
    const rs = document.getElementById('range-saturate');
    // Labels might be hidden but update them anyway
    const lb = document.getElementById('label-brightness');
    const lh = document.getElementById('label-hue');
    const ls = document.getElementById('label-saturate');

    if (rb && lb) lb.textContent = rb.value;
    if (rh && lh) lh.textContent = rh.value + '°';
    if (rs && ls) ls.textContent = rs.value + '%';
    requestAnimationFrame(window.applyLiveFilters);
}

// Attach listeners dynamically [EXISTING]
export function setupUIListeners() {
    const inputs = [document.getElementById('range-brightness'), document.getElementById('range-hue'), document.getElementById('range-saturate')];
    inputs.forEach(input => {
        if (input) {
            input.oninput = onInput;
        }
    });

    // --- BUTTON EVENT LISTENERS (NEW) ---
    // Use delegation or direct attachment
    document.querySelectorAll('.fader-btn-up, .fader-btn-down').forEach(btn => {
        // Remove old listener if re-running (simplest is to just overwrite onclick, or use addEventListener with cleanup, but here overwrite is safe for this scope)
        btn.onclick = (e) => {
            const step = parseInt(btn.dataset.step);
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (input) {
                const currentVal = parseInt(input.value);
                const newVal = currentVal + step;
                // Check min/max
                if (newVal >= parseInt(input.min) && newVal <= parseInt(input.max)) {
                    input.value = newVal;
                    // Trigger input event manually
                    onInput();
                }
            }
        };
    });
}

// (Legacy Manual Trigger Logic Removed - Moved to Phase 7 Init)

// Reset Button
const resetBtn = document.getElementById('btn-reset');
if (resetBtn) {
    resetBtn.onclick = () => {
        const rBrightness = document.getElementById('range-brightness');
        const rHue = document.getElementById('range-hue');
        const rSaturate = document.getElementById('range-saturate');
        if (rBrightness) rBrightness.value = 10;
        if (rHue) rHue.value = 180;
        if (rSaturate) rSaturate.value = 0;
        onInput();
    };
}

// Save Button (Save to Firebase Gallery)
const saveBtn = document.getElementById('btn-save');
if (saveBtn) {
    saveBtn.onclick = async () => {
        // Fix: Use the correct phase6 canvas that contains the composite image
        const canvas = document.getElementById('phase6-canvas');
        if (!canvas) {
            console.error("Save failed: Canvas not found");
            return;
        }
        const dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl) return;

        // Show Loader
        if (typeof toggleLoader === 'function') {
            toggleLoader(true, "ギャラリーに保存中...");
        } else {
            // Fallback if toggleLoader not imported/global?
            // ui.js exports toggleLoader, so we can call it directly if it's in scope, 
            // but we are inside ui.js so we can just call `toggleLoader`.
            toggleLoader(true, "ギャラリーに保存中...");
        }

        try {
            // Determine style/color names from selections or defaults
            const styleSelect = document.querySelector('input[name="style-select"]:checked')?.value;
            const colorSelect = document.querySelector('input[name="color-select"]:checked')?.value;

            let sName = "Adjusted Style";
            let cName = "Adjusted Color";

            if (styleSelect && appState.aiProposal?.hairstyles?.[styleSelect]) {
                sName = appState.aiProposal.hairstyles[styleSelect].name + " (調整済)";
            }
            if (colorSelect && appState.aiProposal?.haircolors?.[colorSelect]) {
                cName = appState.aiProposal.haircolors[colorSelect].name + " (調整済)";
            }

            await saveImageToGallery(
                appState.userProfile.firebaseUid,
                dataUrl,
                sName,
                cName,
                "Manual Adjustment"
            );

            if (window.showModal) window.showModal("保存完了", "ギャラリーに画像を保存しました！");
            else alert("ギャラリーに画像を保存しました！");

        } catch (e) {
            console.error(e);
            if (window.showModal) window.showModal("保存エラー", "保存に失敗しました: " + e.message);
            else alert("保存に失敗しました: " + e.message);
        } finally {
            toggleLoader(false);
        }
    };
}



// Perform Segmentation on the current image
export async function runHairSegmentation(imgElement) {
    if (!imageSegmenter) await ensureHairSegmenterLoaded();
    if (!imageSegmenter || !imgElement) return;

    if (!imgElement.complete || imgElement.naturalWidth === 0) {
        console.log("[ui.js] Image not ready, waiting for load...");
        imgElement.onload = () => runHairSegmentation(imgElement);
        return;
    }

    console.log("[ui.js] Running Hair Segmentation on:", imgElement.src);

    // Constraint for performance on iPad (Max 800px - Safer for iOS Memory)
    const MAX_DIMENSION = 800;
    let width = imgElement.naturalWidth;
    let height = imgElement.naturalHeight;

    // Debug Status Update
    const statusEl = document.getElementById('segmentation-status');
    if (statusEl) statusEl.textContent = `Processing: ${width}x${height} -> Max ${MAX_DIMENSION}`;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        console.log(`[ui.js] Downscaling image for segmentation: ${imgElement.naturalWidth}x${imgElement.naturalHeight} -> ${width}x${height}`);
        if (statusEl) statusEl.textContent = `Downsizing: ${width}x${height}`;
    }

    const inputCanvas = document.createElement('canvas');
    inputCanvas.width = width;
    inputCanvas.height = height;
    const iCtx = inputCanvas.getContext('2d', { willReadFrequently: true });

    try {
        iCtx.drawImage(imgElement, 0, 0, width, height);
    } catch (e) {
        console.error("[ui.js] Failed to draw image to segmentation canvas (CORS?):", e);
        if (statusEl) statusEl.textContent = "Error: Canvas Draw Failed (CORS?)";
        return;
    }

    const displayCanvas = document.getElementById('phase6-canvas');
    if (displayCanvas) {
        displayCanvas.width = width;
        displayCanvas.height = height;
    }

    originalImageBitmap = inputCanvas;

    // Call Segmenter
    if (statusEl) statusEl.textContent = "AI Segmenting...";
    imageSegmenter.segment(inputCanvas, (result) => {
        const mask = result.categoryMask; // MPMask
        if (!mask) {
            if (statusEl) statusEl.textContent = "Error: No Mask Generated";
            return;
        }
        if (statusEl) statusEl.textContent = "Success: Hair Detected";

        const width = inputCanvas.width;
        const height = inputCanvas.height;
        const maskWidth = mask.width;
        const maskHeight = mask.height;

        console.log(`[ui.js] Mask Size: ${maskWidth}x${maskHeight}, Image Size: ${width}x${height}`);

        const hairCanvas = document.createElement('canvas');
        hairCanvas.width = width;
        hairCanvas.height = height;
        const hCtx = hairCanvas.getContext('2d');

        // --- REALITY PRESERVATION (Feathering & Expansion) ---
        // AI-2 generates "stray hairs" (ahoge) which AI-3 tends to cut off.
        // We expand the mask slightly and blur the edges to include these fine details.

        // 1. Create a dedicated mask canvas for processing
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const mCtx = maskCanvas.getContext('2d');

        // 2. Draw the raw binary mask
        const maskImgData = mCtx.createImageData(width, height);
        // Copy alpha channel from maskArray (0 or 1) to alpha (0 or 255)
        for (let i = 0; i < maskArray.length; i++) {
            const alpha = maskArray[i] * 255;
            maskImgData.data[i * 4 + 0] = 0; // R
            maskImgData.data[i * 4 + 1] = 0; // G
            maskImgData.data[i * 4 + 2] = 0; // B
            maskImgData.data[i * 4 + 3] = alpha; // A
        }
        mCtx.putImageData(maskImgData, 0, 0);

        // 3. Expansion (Dilation) - Draw image multiple times with slight offsets
        // This expands the mask by approx 2-3 pixels to catch stray hairs
        const expandedCanvas = document.createElement('canvas');
        expandedCanvas.width = width;
        expandedCanvas.height = height;
        const eCtx = expandedCanvas.getContext('2d');

        // Draw center
        eCtx.drawImage(maskCanvas, 0, 0);
        // Draw offsets
        const offset = 2;
        eCtx.globalCompositeOperation = 'source-over';
        eCtx.drawImage(maskCanvas, -offset, 0);
        eCtx.drawImage(maskCanvas, offset, 0);
        eCtx.drawImage(maskCanvas, 0, -offset);
        eCtx.drawImage(maskCanvas, 0, offset);

        // 4. Feathering (Blur) - Soften the edges
        // Using shadowBlur is expensive, so we use CSS filter or box blur manually.
        // Since we are in canvas, we can use filter property if supported, or a simple trick.
        const featherCanvas = document.createElement('canvas');
        featherCanvas.width = width;
        featherCanvas.height = height;
        const fCtx = featherCanvas.getContext('2d');
        fCtx.filter = 'blur(4px)'; // Soft blur
        fCtx.drawImage(expandedCanvas, 0, 0);
        fCtx.filter = 'none';

        // 5. Apply this Fealthered Mask to Extract Hair
        // Now we use this 'featherCanvas' as the alpha mask for the original image

        // Clear hairCanvas
        hCtx.clearRect(0, 0, width, height);

        // Draw original image
        hCtx.drawImage(originalImageBitmap, 0, 0);

        // Composite the mask using 'destination-in' (Keeps image only where mask is opaque)
        hCtx.globalCompositeOperation = 'destination-in';
        hCtx.drawImage(featherCanvas, 0, 0);

        // Reset composite operation
        hCtx.globalCompositeOperation = 'source-over';

        hairMaskCanvas = hairCanvas;
        console.log(`[ui.js] Hair Pixels Processed with Reality Preservation (Expansion+Blur)`);

        if (window.applyLiveFilters) window.applyLiveFilters();

        // --- HIDE IMAGE NOW ---
        // Now that canvas has the composite, hide the original image
        if (imgElement) imgElement.style.display = 'none';
    });
}



// --- ★ main.js が必要としている関数群 ★ ---

/**
 * DOM要素のセレクタ初期化
 */
export function initializeUISelectors() {
    console.log("[ui.js] initializeUISelectors called");
}

/**
 * UIの初期化処理
 */
export function initializeUI() {
    console.log("[ui.js] initializeUI called");
    toggleLoader(true, "起動中...");
}

/**
 * スマートローダー（実況型ローディング）を開始する
 * @param {Array<string>} steps - 表示するメッセージの配列
 */
export function startSmartLoader(steps) {
    // 既存のインターバルがあればクリア
    if (loaderInterval) clearInterval(loaderInterval);

    const loaderText = document.querySelector('#loading-screen p');
    if (!loaderText) return;

    let currentStep = 0;

    // 最初のメッセージを即時表示
    if (steps.length > 0) {
        loaderText.textContent = steps[0];
        currentStep++;
    }

    // 一定時間ごとにメッセージを切り替え
    loaderInterval = setInterval(() => {
        if (currentStep < steps.length) {
            loaderText.textContent = steps[currentStep];
            currentStep++;
        } else {
            // 最後まで表示しきったらループを止める（最後のメッセージを維持）
            clearInterval(loaderInterval);
            loaderInterval = null;
        }
    }, 2500); // 2.5秒間隔で更新
}

/**
 * スマートローダーを停止する
 */
export function stopSmartLoader() {
    if (loaderInterval) {
        clearInterval(loaderInterval);
        loaderInterval = null;
    }
}

/**
 * ローディング画面の表示/非表示切り替え
 * 通常のテキスト指定も、スマートローダーとの併用も可能
 */
export function toggleLoader(show, text = "処理中...") {
    const loader = document.getElementById('loading-screen');
    if (!loader) return;

    if (show) {
        // Ensure it overlays
        loader.style.display = 'flex';
        // loader.style.zIndex = '9999'; // Assuming CSS handles this
        const p = loader.querySelector('p');
        if (p) p.textContent = text;
    } else {
        loader.style.display = 'none';
        // 非表示にする際は必ずスマートローダーも止める
        stopSmartLoader();
    }
}

/**
 * エラーメッセージの表示
 */
export function showError(message) {
    console.error("[UI Error]", message);
    // ローダーを止めてからエラー表示
    toggleLoader(false);

    if (document.getElementById('custom-modal')) {
        showModal("エラー", message);
    } else {
        alert(message);
    }
}

/**
 * showPhase (changePhaseのエイリアス)
 */
export function showPhase(phaseId) {
    changePhase(phaseId);
}

/**
 * アップロードプレビューの更新 (ログ出力のみ)
 */
export function updateUploadPreview(type, url, isVideo = false) {
    console.log(`[ui.js] Preview updated for ${type}: ${url}`);
}

/**
 * 提案選択状態のチェック
 */
export function checkProposalSelection(isSelected) {
    const btn = document.getElementById('next-to-generate-btn');
    if (btn) {
        btn.disabled = !isSelected;
        btn.classList.toggle('btn-disabled', !isSelected);
    }
}


// --- ★ 既存ロジック ★ ---

/**
 * フェーズ（画面）を切り替える
 * @param {string} phaseId - 切り替え先のフェーズID (例: 'phase2')
 */
export function changePhase(phaseId) {
    const targetId = (typeof phaseId === 'number') ? `phase${phaseId}` : phaseId;
    const currentActivePhase = document.querySelector('.phase-container.active');
    if (currentActivePhase) currentActivePhase.classList.remove('active');

    const targetPhase = document.getElementById(targetId);
    if (targetPhase) {
        targetPhase.classList.add('active');
        window.scrollTo(0, 0);

        // Phase 6 に遷移した時に設定UIを生成する
        if (targetId === 'phase6') {
            renderGenerationConfigUI();

            // ★ Critical Fix: Show original photo immediately when Phase 6 opens
            setTimeout(() => {
                const img = document.getElementById('main-diagnosis-image');
                const container = document.getElementById('phase6-adjustment-container');
                const canvas = document.getElementById('phase6-canvas');

                // Reset Canvas
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }

                if (img && appState.uploadedFileUrls['item-front-photo']) {
                    // Check for Blob
                    if (appState.localBlobs && appState.localBlobs['item-front-photo']) {
                        img.src = URL.createObjectURL(appState.localBlobs['item-front-photo']);
                    } else {
                        img.removeAttribute('crossOrigin');
                        img.src = appState.uploadedFileUrls['item-front-photo'];
                    }
                    img.style.display = 'block';
                    if (container) container.style.display = 'block';

                    // Run Segmentation Immediately for faders
                    // Auto-run enabled for smoother UX on iPad
                    if (typeof runHairSegmentation === 'function') {
                        runHairSegmentation(img);
                    }

                    // Instead reset state so button appears
                    if (window.resetPhase6State) window.resetPhase6State();
                }
            }, 500); // Increased delay slightly to ensure DOM is ready
        }
    } else {
        document.getElementById('phase1')?.classList.add('active');
    }
}

/**
 * AI診断結果 (Phase 4) を画面に表示する
 */
export function displayDiagnosisResult(result) {
    const containers = {
        face: document.getElementById('face-results'),
        skeleton: document.getElementById('skeleton-results'),
        personalColor: document.getElementById('personal-color-results'),
        hairCondition: document.getElementById('hair-condition-results')
    };

    Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });

    if (!result) return;

    if (result.face && containers.face) {
        const map = { nose: "鼻", mouth: "口", eyes: "目", eyebrows: "眉", forehead: "おでこ" };
        Object.entries(result.face).forEach(([key, value]) => {
            containers.face.append(...createResultItem(map[key] || key, value));
        });
    }
    if (result.skeleton && containers.skeleton) {
        const map = { neckLength: "首の長さ", faceShape: "顔の形", bodyLine: "ボディライン", shoulderLine: "肩のライン", faceStereoscopy: "顔の立体感", bodyTypeFeature: "体型の特徴" };
        Object.entries(result.skeleton).forEach(([key, value]) => {
            if (map[key]) containers.skeleton.append(...createResultItem(map[key], value));
        });
    }
    if (result.personalColor && containers.personalColor) {
        const map = { baseColor: "ベースカラー", season: "シーズン", brightness: "明度", saturation: "彩度", eyeColor: "瞳の色" };
        Object.entries(result.personalColor).forEach(([key, value]) => {
            containers.personalColor.append(...createResultItem(map[key] || key, value));
        });
    }
    if (result.hairCondition && containers.hairCondition) {
        const map = { quality: "髪質", curlType: "クセ", damageLevel: "ダメージ", volume: "毛量", currentLevel: "現在の明るさ" };
        Object.entries(result.hairCondition).forEach(([key, value]) => {
            if (map[key]) containers.hairCondition.append(...createResultItem(map[key], value));
        });
    }
}

/**
 * AI提案結果 (Phase 5) を画面に表示する
 */
export function displayProposalResult(proposal) {
    const containers = {
        hairstyle: document.getElementById('hairstyle-proposal'),
        haircolor: document.getElementById('haircolor-proposal'),
        bestColors: document.getElementById('best-colors-proposal'),
        makeup: document.getElementById('makeup-proposal'),
        fashion: document.getElementById('fashion-proposal')
    };

    Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });
    setTextContent('top-stylist-comment-text', '');

    if (!proposal) return;

    // 共通のカード作成ヘルパー (閲覧用)
    const createInfoCard = (title, desc, recLevel) => {
        const card = document.createElement('div');
        card.className = 'proposal-card';
        const levelHtml = recLevel ? `<br><small>推奨: ${escapeHtml(recLevel)}</small>` : '';
        card.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}${levelHtml}</p>`;
        return card;
    };

    // 1. ヘアスタイル提案
    if (proposal.hairstyles && containers.hairstyle) {
        Object.values(proposal.hairstyles).forEach((style) => {
            const card = createInfoCard(style.name, style.description);
            containers.hairstyle.appendChild(card);
        });
    }

    // 2. ヘアカラー提案
    if (proposal.haircolors && containers.haircolor) {
        Object.values(proposal.haircolors).forEach((color) => {
            const card = createInfoCard(color.name, color.description, color.recommendedLevel);
            containers.haircolor.appendChild(card);
        });
    }

    // 3. ベストカラー
    if (proposal.bestColors && containers.bestColors) {
        Object.values(proposal.bestColors).forEach(color => {
            if (!color.hex) return;
            const item = document.createElement('div');
            item.className = 'color-swatch-item';
            item.innerHTML = `<div class="color-swatch-circle" style="background-color:${color.hex}"></div><span class="color-swatch-name">${escapeHtml(color.name)}</span>`;
            containers.bestColors.appendChild(item);
        });
    }
    // 4. メイク提案
    if (proposal.makeup && containers.makeup) {
        const map = { eyeshadow: "アイシャドウ", cheek: "チーク", lip: "リップ" };
        Object.entries(proposal.makeup).forEach(([key, value]) => {
            const items = createResultItem(map[key] || key, value);
            items[0].className = 'makeup-item-label'; items[1].className = 'makeup-item-value';
            containers.makeup.append(...items);
        });
    }
    // 5. ファッション提案
    if (proposal.fashion && containers.fashion) {
        if (proposal.fashion.recommendedStyles) {
            const val = Array.isArray(proposal.fashion.recommendedStyles)
                ? proposal.fashion.recommendedStyles.join(' / ')
                : proposal.fashion.recommendedStyles;
            const items = createResultItem("似合うスタイル", val);
            items[0].className = 'makeup-item-label'; items[1].className = 'makeup-item-value';
            containers.fashion.append(...items);
        }
        if (proposal.fashion.recommendedItems) {
            const val = Array.isArray(proposal.fashion.recommendedItems)
                ? proposal.fashion.recommendedItems.join(' / ')
                : proposal.fashion.recommendedItems;
            const items = createResultItem("似合うアイテム", val);
            items[0].className = 'makeup-item-label'; items[1].className = 'makeup-item-value';
            containers.fashion.append(...items);
        }
    }
    // 6. AIコメント
    if (proposal.comment) setTextContent('top-stylist-comment-text', proposal.comment);
}

/**
 * Phase 6: 画像生成の設定UI (ラジオボタン群) をレンダリングする
 */
function renderGenerationConfigUI() {
    const styleContainer = document.getElementById('style-selection-group');
    const colorContainer = document.getElementById('color-selection-group');
    const proposal = appState.aiProposal;
    const hasInspiration = !!appState.inspirationImageUrl;

    if (!styleContainer || !colorContainer || !proposal) return;

    // Helper: ラジオボタンのHTML生成
    const createRadioOption = (groupName, value, labelText, isChecked = false) => {
        const id = `${groupName}-${value}`;
        // Insert break after colon if present for better legibility
        const formattedLabel = labelText.replace(/：/g, '：<br>');

        return `
            <div class="radio-option" style="margin-bottom: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #fff;">
                <input type="radio" name="${groupName}" id="${id}" value="${value}" ${isChecked ? 'checked' : ''}>
                <label for="${id}" style="font-size: 11px; font-weight: bold; margin-left: 5px; display: inline-block; vertical-align: top; line-height: 1.4;">${formattedLabel}</label>
            </div>
        `;
    };

    // 1. スタイル選択肢の生成
    let styleHtml = '';
    if (proposal.hairstyles) {
        styleHtml += createRadioOption('style-select', 'style1', `提案Style1: ${proposal.hairstyles.style1.name}`, true);
        styleHtml += createRadioOption('style-select', 'style2', `提案Style2: ${proposal.hairstyles.style2.name}`);
    }
    if (hasInspiration) {
        styleHtml += createRadioOption('style-select', 'user_request', '★ ご希望のStyle (写真から再現)');
    }
    // 新規追加: Keep
    styleHtml += createRadioOption('style-select', 'keep_style', 'スタイルは変えない (現在の髪型のまま)');

    styleContainer.innerHTML = styleHtml;

    // 2. カラー選択肢の生成
    let colorHtml = '';
    if (proposal.haircolors) {
        colorHtml += createRadioOption('color-select', 'color1', `提案Color1: ${proposal.haircolors.color1.name}`, true);
        colorHtml += createRadioOption('color-select', 'color2', `提案Color2: ${proposal.haircolors.color2.name}`);
    }
    if (hasInspiration) {
        colorHtml += createRadioOption('color-select', 'user_request', '★ ご希望のColor (写真から再現)');
    }
    // 新規追加: Keep
    colorHtml += createRadioOption('color-select', 'keep_color', '明るさを選択');

    colorContainer.innerHTML = colorHtml;
}

/**
 * ファイルアップロード完了状態に応じてボタンを有効化/無効化する
 */
export function checkAllFilesUploaded(allUploaded) {
    const btn = document.getElementById('request-diagnosis-btn');
    if (btn) {
        btn.disabled = !allUploaded;
        if (allUploaded) {
            btn.classList.remove('btn-disabled');
        } else {
            btn.classList.add('btn-disabled');
        }
    }
}

export function updateCaptureLoadingText(element, text) {
    if (element) element.textContent = text;
}

/**
 * 生成結果表示
 */
export function displayGeneratedImage(base64Data, mimeType, styleName, colorName, toneLevel) {
    // New UI Elements
    const adjustmentContainer = document.getElementById('phase6-adjustment-container');
    const mainDiagnosisImage = document.getElementById('main-diagnosis-image');

    // Old UI Elements (Hidden or Removed)
    const generatedImageContainer = document.querySelector('.generated-image-container');
    const postActions = document.getElementById('post-generation-actions');

    // Initialize logic if elements exist
    initializePhase6Adjustments();

    // 1. Removed redundant src assignment to prevent race condition/tainting
    // The correct assignment happens later with onload handler

    // Reset State (Show Button, Hide Faders)
    if (window.resetPhase6State) window.resetPhase6State();

    // Reset UI for new analysis
    if (window.resetPhase6State) window.resetPhase6State();

    if (mainDiagnosisImage) {
        // Wait for image load
        // Auto-segmentation enabled for seamless iPad experience
        mainDiagnosisImage.onload = () => {
            // Delay slightly to ensure layout is stable
            setTimeout(() => {
                if (typeof runHairSegmentation === 'function') {
                    runHairSegmentation(mainDiagnosisImage);
                }
            }, 300);
        };
        // Set crossOrigin explicitly
        mainDiagnosisImage.crossOrigin = "anonymous";

        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        mainDiagnosisImage.src = dataUrl;

        // Reset filters when a new image is loaded
        mainDiagnosisImage.style.filter = 'none';

        // Reset sliders visually
        const rBrightness = document.getElementById('range-brightness');
        const rHue = document.getElementById('range-hue');
        const rSaturate = document.getElementById('range-saturate');
        const lBrightness = document.getElementById('label-brightness');
        const lHue = document.getElementById('label-hue');
        const lSaturate = document.getElementById('label-saturate');

        if (rBrightness) rBrightness.value = 10;
        if (rHue) rHue.value = 180;
        if (rSaturate) rSaturate.value = 0;
        if (lBrightness) lBrightness.textContent = '10';
        if (lHue) lHue.textContent = '180°';
        if (lSaturate) lSaturate.textContent = '0%';

        // Also clear canvas if exists
        const canvas = document.getElementById('phase6-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (adjustmentContainer) {
            adjustmentContainer.style.display = 'block';
        }
    }

    // Ensure old elements are hidden if they still exist
    if (generatedImageContainer) generatedImageContainer.style.display = 'none';
    // Ensure old elements are hidden if they still exist
    if (generatedImageContainer) generatedImageContainer.style.display = 'none';
    // RESTORED: Do not hide postActions (Save features)
    if (postActions) postActions.style.display = 'block';
}

export function showModal(title, message, onOk = null) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const okBtn = document.getElementById('modal-ok-btn');

    if (!modal || !titleEl || !messageEl || !okBtn) return;

    titleEl.textContent = title || "お知らせ";
    messageEl.textContent = message || "";

    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    newOkBtn.addEventListener('click', () => {
        hideModal();
        if (onOk) onOk();
    });

    modal.classList.add('active');
}

export function hideModal() {
    const modal = document.getElementById('custom-modal');
    if (modal) modal.classList.remove('active');
}

export function setupFaderButtonListeners() {
    console.log("[ui.js] Setting up Fader Button Listeners");
    document.querySelectorAll('.fader-btn-down, .fader-btn-up').forEach(btn => {
        // Clone to start fresh
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = newBtn.getAttribute('data-target');
            const step = parseInt(newBtn.getAttribute('data-step') || "0");
            const input = document.getElementById(targetId);

            if (input) {
                let val = parseInt(input.value);
                val += step;

                const min = parseInt(input.min);
                const max = parseInt(input.max);
                if (!isNaN(min) && val < min) val = min;
                if (!isNaN(max) && val > max) val = max;

                input.value = val;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });
}
