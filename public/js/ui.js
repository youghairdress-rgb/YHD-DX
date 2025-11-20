/**
 * ui.js
 * DOM操作と画面描画ロジック
 */

import { escapeHtml, createResultItem, setTextContent } from './helpers.js';

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
 * ★ 修正: hasInspirationImage 引数を追加し、ご希望カードを表示
 * @param {object} proposal - 提案オブジェクト
 * @param {function} onProposalClick - 提案カードクリック時のハンドラ
 * @param {boolean} hasInspirationImage - ご希望写真があるかどうか
 */
export function displayProposalResult(proposal, onProposalClick, hasInspirationImage = false) {
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

    // 共通のカード作成ヘルパー
    const createCard = (type, key, title, desc, isSelected = false) => {
        const card = document.createElement('div');
        card.className = 'proposal-card';
        if (isSelected) card.classList.add('selected');
        
        card.dataset.type = type;
        card.dataset.key = key;
        card.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${desc}</p>`; 
        card.addEventListener('click', onProposalClick);
        return card;
    };

    // 1. ヘアスタイル提案
    if (proposal.hairstyles && containers.hairstyle) {
        Object.entries(proposal.hairstyles).forEach(([key, style]) => {
            const card = createCard('hairstyle', key, style.name, escapeHtml(style.description), key === 'style1');
            containers.hairstyle.appendChild(card);
        });
        
        // ★ 追加: ご希望スタイルボタン
        if (hasInspirationImage) {
            const card = createCard(
                'hairstyle', 
                'user_request', 
                '★ ご希望のヘアスタイル', 
                'アップロードされた写真を参考に再現します。'
            );
            // 特別なスタイルを適用
            card.style.borderStyle = 'dashed';
            card.style.borderColor = 'var(--primary-color-dark)';
            containers.hairstyle.appendChild(card);
        }
    }

    // 2. ヘアカラー提案
    if (proposal.haircolors && containers.haircolor) {
        Object.entries(proposal.haircolors).forEach(([key, color]) => {
            const recLevel = color.recommendedLevel ? `<br><small>推奨: ${escapeHtml(color.recommendedLevel)}</small>` : '';
            const card = createCard('haircolor', key, color.name, escapeHtml(color.description) + recLevel, key === 'color1');
            containers.haircolor.appendChild(card);
        });

        // ★ 追加: ご希望カラーボタン
        if (hasInspirationImage) {
            const card = createCard(
                'haircolor', 
                'user_request', 
                '★ ご希望のヘアカラー', 
                'アップロードされた写真を参考に再現します。'
            );
            card.style.borderStyle = 'dashed';
            card.style.borderColor = 'var(--primary-color-dark)';
            containers.haircolor.appendChild(card);
        }
    }

    // 3. ベストカラー (スウォッチ表示)
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

/**
 * 提案選択状態に応じてボタンを有効化/無効化する
 * @param {boolean} bothSelected - ヘアスタイルとカラー両方が選択されているか
 */
export function checkProposalSelection(bothSelected) {
    const btn = document.getElementById('next-to-generate-btn');
    if (btn) {
        btn.disabled = !bothSelected;
        if (bothSelected) {
            btn.classList.remove('btn-disabled');
        } else {
            btn.classList.add('btn-disabled');
        }
    }
}

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
    const descriptionEl = document.getElementById('generated-image-description'); // ★追加
    const saveButton = document.getElementById('save-generated-image-to-db-btn');
    
    if (generatedImage) {
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        generatedImage.src = dataUrl;
        generatedImage.style.opacity = '1';
        
        if (generatedImageContainer) {
            generatedImageContainer.style.display = 'block';
        }
    }

    // ★追加: 説明テキストの更新
    if (descriptionEl) {
        // トーンの表示形式を整形 (例: "Tone 9" -> "9トーン")
        const toneDisplay = toneLevel ? toneLevel.replace('Tone ', '') + 'トーン' : 'AI推奨トーン';
        
        // テキストを生成: 例「センターパートアップバング ✖ 9トーン の オリーブブラウン」
        const text = `${styleName || 'スタイル'} ✖ ${toneDisplay} の ${colorName || 'カラー'}`;
        
        descriptionEl.textContent = text;
        descriptionEl.style.fontWeight = 'bold'; 
        descriptionEl.style.color = 'var(--dark-color)';
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