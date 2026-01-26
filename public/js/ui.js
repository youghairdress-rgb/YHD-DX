/**
 * ui.js
 * DOM操作と画面描画ロジック
 * [Update] UX強化: 処理状況を実況するスマートローダー機能を追加
 */

import { escapeHtml, createResultItem, setTextContent } from './helpers.js';
import { appState } from './state.js';


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
        loader.style.display = 'flex';
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
    
    Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; });

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
    
    Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; });
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
    colorHtml += createRadioOption('color-select', 'keep_color', 'ヘアカラーは変えない (現在の髪色のまま)');

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
    const generatedImage = document.getElementById('generated-image');
    const generatedImageContainer = document.querySelector('.generated-image-container');
    const descriptionEl = document.getElementById('generated-image-description');
    const saveButton = document.getElementById('save-generated-image-to-db-btn');
    const postActions = document.getElementById('post-generation-actions');
    
    if (generatedImage) {
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        generatedImage.src = dataUrl;
        generatedImage.style.opacity = '1';
        
        if (generatedImageContainer) {
            generatedImageContainer.style.display = 'block';
        }
    }

    if (descriptionEl) {
        const toneDisplay = toneLevel ? toneLevel.replace('Tone ', '') + 'トーン' : 'AI推奨トーン';
        
        // Keepの場合の表示ロジック
        const styleDisplay = styleName === '現在の髪型' ? '現在の髪型' : (styleName || 'スタイル');
        const colorDisplay = colorName === '現在の髪色' ? '現在の髪色' : (colorName || 'カラー');

        const text = `${styleDisplay} ✖ ${toneDisplay} の ${colorDisplay}`;
        
        descriptionEl.textContent = text;
        descriptionEl.style.fontWeight = 'bold'; 
        descriptionEl.style.color = 'var(--dark-color)';
    }
    
    if (postActions) postActions.style.display = 'block';
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.classList.remove('btn-disabled');
    }
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