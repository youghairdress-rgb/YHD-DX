/**
 * ui.js
 * DOM操作と画面描画ロジック
 */

import { escapeHtml, createResultItem, setTextContent } from './helpers.js';
import { appState } from './state.js';

/**
 * フェーズ（画面）を切り替える
 * @param {string} phaseId - 切り替え先のフェーズID (例: 'phase2')
 */
export function changePhase(phaseId) {
    const currentActivePhase = document.querySelector('.phase-container.active');
    if (currentActivePhase) currentActivePhase.classList.remove('active');

    const targetPhase = document.getElementById(phaseId);
    if (targetPhase) {
        targetPhase.classList.add('active');
        window.scrollTo(0, 0); 
        
        // Phase 6 に遷移した時に設定UIを生成する
        if (phaseId === 'phase6') {
            renderGenerationConfigUI();
        }
    } else {
        // 指定がなければPhase1に戻す
        document.getElementById('phase1')?.classList.add('active');
    }
}

/**
 * AI診断結果 (Phase 4) を画面に表示する
 * @param {object} result - 診断結果オブジェクト
 */
export function displayDiagnosisResult(result) {
    const containers = {
        face: document.getElementById('face-results'),
        skeleton: document.getElementById('skeleton-results'),
        personalColor: document.getElementById('personal-color-results'),
        hairCondition: document.getElementById('hair-condition-results')
    };
    
    // コンテナをクリア
    Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; });

    if (!result) return;

    // 1. 顔診断
    if (result.face && containers.face) {
        const map = { nose: "鼻", mouth: "口", eyes: "目", eyebrows: "眉", forehead: "おでこ" };
        Object.entries(result.face).forEach(([key, value]) => {
            containers.face.append(...createResultItem(map[key] || key, value));
        });
    }
    // 2. 骨格診断
    if (result.skeleton && containers.skeleton) {
        const map = { neckLength: "首の長さ", faceShape: "顔の形", bodyLine: "ボディライン", shoulderLine: "肩のライン", faceStereoscopy: "顔の立体感", bodyTypeFeature: "体型の特徴" };
        Object.entries(result.skeleton).forEach(([key, value]) => {
            if (map[key]) containers.skeleton.append(...createResultItem(map[key], value));
        });
    }
    // 3. パーソナルカラー
    if (result.personalColor && containers.personalColor) {
         const map = { baseColor: "ベースカラー", season: "シーズン", brightness: "明度", saturation: "彩度", eyeColor: "瞳の色" };
         Object.entries(result.personalColor).forEach(([key, value]) => {
             containers.personalColor.append(...createResultItem(map[key] || key, value));
         });
    }
    // 4. 髪の状態
    if (result.hairCondition && containers.hairCondition) {
        const map = { quality: "髪質", curlType: "クセ", damageLevel: "ダメージ", volume: "毛量", currentLevel: "現在の明るさ" };
        Object.entries(result.hairCondition).forEach(([key, value]) => {
            if (map[key]) containers.hairCondition.append(...createResultItem(map[key], value));
        });
    }
}

/**
 * AI提案結果 (Phase 5) を画面に表示する
 * @param {object} proposal - 提案オブジェクト
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

    // 共通のカード作成ヘルパー (Phase 5用: 選択機能なし)
    const createInfoCard = (title, desc, recLevel) => {
        const card = document.createElement('div');
        card.className = 'proposal-card'; // 選択機能はないが見た目は同じ
        // クリックイベントは設定しない
        const levelHtml = recLevel ? `<br><small>推奨: ${escapeHtml(recLevel)}</small>` : '';
        card.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}${levelHtml}</p>`;
        return card;
    };

    // 1. ヘアスタイル提案 (表示のみ)
    if (proposal.hairstyles && containers.hairstyle) {
        Object.values(proposal.hairstyles).forEach((style) => {
            const card = createInfoCard(style.name, style.description);
            containers.hairstyle.appendChild(card);
        });
    }

    // 2. ヘアカラー提案 (表示のみ)
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
            <div class="radio-option">
                <input type="radio" id="${id}" name="${groupName}" value="${value}" ${isChecked ? 'checked' : ''}>
                <label for="${id}">${escapeHtml(labelText)}</label>
            </div>
        `;
    };

    // 1. スタイル選択肢の生成
    let styleHtml = '';
    // 提案スタイル1 & 2
    if (proposal.hairstyles) {
        styleHtml += createRadioOption('style-select', 'style1', `提案Style1: ${proposal.hairstyles.style1.name}`, true);
        styleHtml += createRadioOption('style-select', 'style2', `提案Style2: ${proposal.hairstyles.style2.name}`);
    }
    // ご希望スタイル (あれば)
    if (hasInspiration) {
        styleHtml += createRadioOption('style-select', 'user_request', '★ ご希望のStyle (写真から再現)');
    }
    // スタイルは変えない (Keep)
    styleHtml += createRadioOption('style-select', 'keep_style', 'スタイルは変えない (現在の髪型のまま)');
    
    styleContainer.innerHTML = styleHtml;
    
    // イベントリスナー設定 (appState更新)
    document.querySelectorAll('input[name="style-select"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            appState.selectedProposal.hairstyle = e.target.value;
        });
    });
    // 初期値をセット
    appState.selectedProposal.hairstyle = 'style1';


    // 2. カラー選択肢の生成
    let colorHtml = '';
    // 提案カラー1 & 2
    if (proposal.haircolors) {
        colorHtml += createRadioOption('color-select', 'color1', `提案Color1: ${proposal.haircolors.color1.name}`, true);
        colorHtml += createRadioOption('color-select', 'color2', `提案Color2: ${proposal.haircolors.color2.name}`);
    }
    // ご希望カラー (あれば)
    if (hasInspiration) {
        colorHtml += createRadioOption('color-select', 'user_request', '★ ご希望のColor (写真から再現)');
    }
    // カラーは変えない (Keep)
    colorHtml += createRadioOption('color-select', 'keep_color', 'ヘアカラーは変えない (現在の髪色のまま)');

    colorContainer.innerHTML = colorHtml;

    // イベントリスナー設定 (appState更新)
    document.querySelectorAll('input[name="color-select"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            appState.selectedProposal.haircolor = e.target.value;
        });
    });
    // 初期値をセット
    appState.selectedProposal.haircolor = 'color1';
}

/**
 * ファイルアップロード完了状態に応じてボタンを有効化/無効化する
 * @param {boolean} allUploaded - 全ての必須ファイルがアップロードされたか
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

// checkProposalSelection は不要になったため削除 (未選択でも進めるため)

/**
 * キャプチャ中のローディングテキストを更新する (画像保存機能用)
 * @param {HTMLElement} element - 対象要素
 * @param {string} text - 表示テキスト
 */
export function updateCaptureLoadingText(element, text) {
    if (element) element.textContent = text;
}

/**
 * 生成された画像 (Base64) と説明テキストを表示する
 * @param {string} base64Data - 画像のBase64データ
 * @param {string} mimeType - MIMEタイプ (例: 'image/png')
 * @param {string} styleName - ヘアスタイル名
 * @param {string} colorName - ヘアカラー名
 * @param {string} toneLevel - トーンレベル (例: "Tone 9")
 */
export function displayGeneratedImage(base64Data, mimeType, styleName, colorName, toneLevel) {
    const generatedImage = document.getElementById('generated-image');
    const generatedImageContainer = document.querySelector('.generated-image-container');
    const descriptionEl = document.getElementById('generated-image-description');
    const saveButton = document.getElementById('save-generated-image-to-db-btn');
    const postActions = document.getElementById('post-generation-actions'); // 保存・共有ボタンのコンテナ
    
    if (generatedImage) {
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        generatedImage.src = dataUrl;
        generatedImage.style.opacity = '1';
        
        if (generatedImageContainer) {
            generatedImageContainer.style.display = 'block';
        }
    }

    // 説明テキストの更新
    if (descriptionEl) {
        const toneDisplay = toneLevel ? toneLevel.replace('Tone ', '') + 'トーン' : 'AI推奨トーン';
        
        // 表示ロジックの微調整 (Keepの場合の表示)
        const styleDisplay = styleName === 'keep_style' ? '現在の髪型' : (styleName || 'スタイル');
        const colorDisplay = colorName === 'keep_color' ? '現在の髪色' : (colorName || 'カラー');

        const text = `${styleDisplay} ✖ ${toneDisplay} の ${colorDisplay}`;
        
        descriptionEl.textContent = text;
        descriptionEl.style.fontWeight = 'bold'; 
        descriptionEl.style.color = 'var(--dark-color)';
    }
    
    // 保存ボタン群を表示
    if (postActions) {
        postActions.style.display = 'block';
    }
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.classList.remove('btn-disabled');
    }
}

/**
 * カスタムモーダルを表示する
 * @param {string} title - タイトル
 * @param {string} message - メッセージ本文
 * @param {function} onOk - OKボタンクリック時のコールバック (任意)
 */
export function showModal(title, message, onOk = null) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const okBtn = document.getElementById('modal-ok-btn');

    if (!modal || !titleEl || !messageEl || !okBtn) return;

    titleEl.textContent = title || "お知らせ";
    messageEl.textContent = message || "";

    // ボタンのイベントリスナーをリセット（複製防止）
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    newOkBtn.addEventListener('click', () => {
        hideModal();
        if (onOk) onOk();
    });

    modal.classList.add('active');
}

/**
 * カスタムモーダルを非表示にする
 */
export function hideModal() {
    const modal = document.getElementById('custom-modal');
    if (modal) modal.classList.remove('active');
}