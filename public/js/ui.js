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
                delegate: "GPU"
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
    // REMOVED: if (phase6AdjustmentsInitialized) return;
    console.log("[ui.js] initializePhase6Adjustments called (FORCE RUN)");

    // Start loading model immediately
    ensureHairSegmenterLoaded();

    // Elements
    const imgElement = document.getElementById('main-diagnosis-image');
    // Ensure CORS for MediaPipe
    if (imgElement) {
        imgElement.crossOrigin = "anonymous";
        // REMOVED: imgElement.style.display = 'none'; -> Keep visible initially!
        imgElement.style.display = 'block';
    }

    // Create or Get Canvas
    let canvas = document.getElementById('phase6-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'phase6-canvas';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'cover';
        canvas.style.borderRadius = '15px'; // Match CSS

        // Insert after img
        if (imgElement && imgElement.parentNode) {
            imgElement.parentNode.appendChild(canvas);
        }
    }

    const rBrightness = document.getElementById('range-brightness');
    const rHue = document.getElementById('range-hue');
    const rSaturate = document.getElementById('range-saturate');

    const lBrightness = document.getElementById('label-brightness');
    const lHue = document.getElementById('label-hue');
    const lSaturate = document.getElementById('label-saturate');

    // Logic should always run to ensure handlers/buttons are set up
    // if (!rBrightness || !rHue || !rSaturate) { <--- REMOVED CHECK
    // Helper: Draw Result (Advanced Hair Coloring)
    function drawComposite() {
        // Dynamic Element Lookup to avoid stale closures
        const rBrightness = document.getElementById('range-brightness');
        const rHue = document.getElementById('range-hue');
        const rSaturate = document.getElementById('range-saturate');

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
        const lb = document.getElementById('label-brightness');
        const lh = document.getElementById('label-hue');
        const ls = document.getElementById('label-saturate');

        if (rb && lb) lb.textContent = rb.value;
        if (rh && lh) lh.textContent = rh.value + '°';
        if (rs && ls) ls.textContent = rs.value + '%';
        requestAnimationFrame(window.applyLiveFilters);
    }

    // Attach listeners dynamically
    const inputs = [document.getElementById('range-brightness'), document.getElementById('range-hue'), document.getElementById('range-saturate')];
    inputs.forEach(input => {
        if (input) {
            // Remove old to prevent duplicates? difficult.
            input.oninput = onInput; // Use property to overwrite
        }
    });

    // --- Manual Analysis Trigger Logic ---
    // Update: Robust insertion logic targeting specific container classes
    const container = document.getElementById('phase6-adjustment-container');
    const controls = container ? container.querySelector('.adjustment-controls') : null;

    if (container && controls) {
        // Create or Get Button
        let analyzeBtn = document.getElementById('btn-analyze-hair');
        if (!analyzeBtn) {
            analyzeBtn = document.createElement('button');
            analyzeBtn.id = 'btn-analyze-hair';
            container.insertBefore(analyzeBtn, controls);
        }

        // Apply Styles & Props (Always update to ensure consistency)
        analyzeBtn.className = 'btn-primary';
        analyzeBtn.textContent = '髪のトーン調整を開始';
        analyzeBtn.style.marginTop = '15px';
        analyzeBtn.style.width = '100%';
        analyzeBtn.style.marginBottom = '20px';
        analyzeBtn.style.display = 'block';
        analyzeBtn.disabled = false;

        // Hide Faders Initially
        controls.style.display = 'none';

        // Button Click Handler (Use onclick to avoid duplicates)
        analyzeBtn.onclick = async () => {
            const img = document.getElementById('main-diagnosis-image');
            if (!img) return;

            analyzeBtn.disabled = true;
            analyzeBtn.textContent = '髪の毛を分析中...';

            // Run Segmentation
            await runHairSegmentation(img);

            // On Success
            if (hairMaskCanvas) {
                analyzeBtn.textContent = '分析完了（調整モード）';
                analyzeBtn.style.display = 'block';
                analyzeBtn.style.background = '#666'; // Dim it

                controls.style.display = 'flex'; // Show faders

                // Reset Faders
                const rBrightness = document.getElementById('range-brightness');
                const rHue = document.getElementById('range-hue');
                const rSaturate = document.getElementById('range-saturate');

                if (rBrightness) rBrightness.value = 10;
                if (rHue) rHue.value = 180;
                if (rSaturate) rSaturate.value = 0;
                onInput();
            } else {
                analyzeBtn.textContent = '分析失敗。もう一度試してください';
                analyzeBtn.disabled = false;
            }
        };

        // Export resetting function
        window.resetPhase6State = () => {
            const b = document.getElementById('btn-analyze-hair');
            if (b) {
                b.style.display = 'block';
                b.textContent = '髪のトーン調整を開始';
                b.disabled = false;
            }
            if (controls) controls.style.display = 'none';

            // Restore Main Image
            const img = document.getElementById('main-diagnosis-image');
            if (img) img.style.display = 'block';

            // Clear previous mask
            hairMaskCanvas = null;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

    } else {
        console.error("[ui.js] Critical Error: Adjustment Container or Controls not found in DOM.");
    }

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
            if (!canvas) return;
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

    // } <--- REMOVED CLOSING BRACE

    phase6AdjustmentsInitialized = true;
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

    const inputCanvas = document.createElement('canvas');
    inputCanvas.width = imgElement.naturalWidth;
    inputCanvas.height = imgElement.naturalHeight;
    const iCtx = inputCanvas.getContext('2d', { willReadFrequently: true });

    try {
        iCtx.drawImage(imgElement, 0, 0, inputCanvas.width, inputCanvas.height);
    } catch (e) {
        console.error("[ui.js] Failed to draw image to segmentation canvas (CORS?):", e);
        return;
    }

    const displayCanvas = document.getElementById('phase6-canvas');
    if (displayCanvas) {
        displayCanvas.width = inputCanvas.width;
        displayCanvas.height = inputCanvas.height;
    }

    originalImageBitmap = inputCanvas;

    imageSegmenter.segment(inputCanvas, (result) => {
        const mask = result.categoryMask; // MPMask
        if (!mask) return;

        const width = inputCanvas.width;
        const height = inputCanvas.height;
        const maskWidth = mask.width;
        const maskHeight = mask.height;

        console.log(`[ui.js] Mask Size: ${maskWidth}x${maskHeight}, Image Size: ${width}x${height}`);

        const hairCanvas = document.createElement('canvas');
        hairCanvas.width = width;
        hairCanvas.height = height;
        const hCtx = hairCanvas.getContext('2d');

        const sourceData = iCtx.getImageData(0, 0, width, height).data;
        const maskArray = mask.getAsUint8Array(); // length = maskWidth * maskHeight

        const hairImgData = hCtx.createImageData(width, height);
        const hairData = hairImgData.data;

        let hairCount = 0;

        // Robust Loop with Scaling
        // Iterate over OUTPUT pixels (width x height)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Map to Mask Coordinates
                const mx = Math.floor(x * maskWidth / width);
                const my = Math.floor(y * maskHeight / height);
                const maskIdx = my * maskWidth + mx;

                const isHair = maskArray[maskIdx] === 1;

                const idx = (y * width + x) * 4;

                if (isHair) {
                    hairCount++;
                    hairData[idx] = sourceData[idx];     // R
                    hairData[idx + 1] = sourceData[idx + 1]; // G
                    hairData[idx + 2] = sourceData[idx + 2]; // B
                    hairData[idx + 3] = sourceData[idx + 3]; // A
                } else {
                    hairData[idx + 3] = 0; // Transparent
                }
            }
        }

        hCtx.putImageData(hairImgData, 0, 0);
        hairMaskCanvas = hairCanvas;
        console.log(`[ui.js] Hair Pixels: ${hairCount}`);

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
                    // Removed auto-run per user request for manual trigger
                    // runHairSegmentation(img);

                    // Instead reset state so button appears
                    if (window.resetPhase6State) window.resetPhase6State();
                }
            }, 100);
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
        return `
            <div class="radio-option" style="margin-bottom: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #fff;">
                <input type="radio" id="${id}" name="${groupName}" value="${value}" ${isChecked ? 'checked' : ''} style="margin-right: 8px;">
                <label for="${id}" style="cursor: pointer; font-weight: 500;">${escapeHtml(labelText)}</label>
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

    if (mainDiagnosisImage && base64Data) {
        mainDiagnosisImage.src = `data:${mimeType};base64,${base64Data}`;
        mainDiagnosisImage.style.display = 'block';
    }

    // Reset State (Show Button, Hide Faders)
    if (window.resetPhase6State) window.resetPhase6State();

    // Reset UI for new analysis
    if (window.resetPhase6State) window.resetPhase6State();

    if (mainDiagnosisImage) {
        // Wait for image load
        // Removed auto-segmentation. User will click button.
        // mainDiagnosisImage.onload = () => {
        //     runHairSegmentation(mainDiagnosisImage);
        // };
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
        if (rHue) rHue.value = 0;
        if (rSaturate) rSaturate.value = 100;
        if (lBrightness) lBrightness.textContent = '10';
        if (lHue) lHue.textContent = '0°';
        if (lSaturate) lSaturate.textContent = '100%';

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