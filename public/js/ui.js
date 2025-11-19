import { escapeHtml, createResultItem, setTextContent } from './helpers.js';

export function changePhase(phaseId) {
    const currentActivePhase = document.querySelector('.phase-container.active');
    if (currentActivePhase) currentActivePhase.classList.remove('active');

    const targetPhase = document.getElementById(phaseId);
    if (targetPhase) {
        targetPhase.classList.add('active');
        window.scrollTo(0, 0); 
    } else {
        document.getElementById('phase1')?.classList.add('active');
    }
}

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
        const map = { quality: "髪質", curlType: "クセ", damageLevel: "ダメージ", volume: "毛量" };
        Object.entries(result.hairCondition).forEach(([key, value]) => {
            if (map[key]) containers.hairCondition.append(...createResultItem(map[key], value));
        });
    }
}

export function displayProposalResult(proposal, onProposalClick) {
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

    if (proposal.hairstyles && containers.hairstyle) {
        Object.entries(proposal.hairstyles).forEach(([key, style]) => {
            const card = document.createElement('div');
            card.className = 'proposal-card';
            card.dataset.type = 'hairstyle';
            card.dataset.key = key;
            card.innerHTML = `<strong>${escapeHtml(style.name)}</strong><p>${escapeHtml(style.description)}</p>`;
            card.addEventListener('click', onProposalClick);
            containers.hairstyle.appendChild(card);
        });
    }
    if (proposal.haircolors && containers.haircolor) {
        Object.entries(proposal.haircolors).forEach(([key, color]) => {
            const card = document.createElement('div');
            card.className = 'proposal-card';
            card.dataset.type = 'haircolor';
            card.dataset.key = key;
            card.innerHTML = `<strong>${escapeHtml(color.name)}</strong><p>${escapeHtml(color.description)}</p>`;
            card.addEventListener('click', onProposalClick);
            containers.haircolor.appendChild(card);
        });
    }
    if (proposal.bestColors && containers.bestColors) {
        Object.values(proposal.bestColors).forEach(color => {
            if (!color.hex) return;
            const item = document.createElement('div');
            item.className = 'color-swatch-item';
            item.innerHTML = `<div class="color-swatch-circle" style="background-color:${color.hex}"></div><span class="color-swatch-name">${escapeHtml(color.name)}</span>`;
            containers.bestColors.appendChild(item);
        });
    }
    if (proposal.makeup && containers.makeup) {
        const map = { eyeshadow: "アイシャドウ", cheek: "チーク", lip: "リップ" };
        Object.entries(proposal.makeup).forEach(([key, value]) => {
            const items = createResultItem(map[key] || key, value);
            items[0].className = 'makeup-item-label'; items[1].className = 'makeup-item-value';
            containers.makeup.append(...items);
        });
    }
    if (proposal.fashion && containers.fashion) {
        if (proposal.fashion.recommendedStyles) {
            const items = createResultItem("似合うスタイル", proposal.fashion.recommendedStyles.join(' / '));
            items[0].className = 'makeup-item-label'; items[1].className = 'makeup-item-value';
            containers.fashion.append(...items);
        }
        if (proposal.fashion.recommendedItems) {
            const items = createResultItem("似合うアイテム", proposal.fashion.recommendedItems.join(' / '));
            items[0].className = 'makeup-item-label'; items[1].className = 'makeup-item-value';
            containers.fashion.append(...items);
        }
    }
    if (proposal.comment) setTextContent('top-stylist-comment-text', proposal.comment);
}

export function checkAllFilesUploaded(allUploaded) {
    const btn = document.getElementById('request-diagnosis-btn');
    if (btn) {
        btn.disabled = !allUploaded;
        btn.classList.toggle('btn-disabled', !allUploaded);
    }
}

export function checkProposalSelection(bothSelected) {
    const btn = document.getElementById('next-to-generate-btn');
    if (btn) {
        btn.disabled = !bothSelected;
        btn.classList.toggle('btn-disabled', !bothSelected);
    }
}

export function updateCaptureLoadingText(element, text) {
    if (element) element.textContent = text;
}

export function displayGeneratedImage(base64Data, mimeType) {
    const generatedImage = document.getElementById('generated-image');
    const generatedImageContainer = document.querySelector('.generated-image-container');
    const saveButton = document.getElementById('save-generated-image-to-db-btn');
    
    if (generatedImage) {
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        generatedImage.src = dataUrl;
        generatedImage.style.opacity = '1';
        
        if (generatedImageContainer) {
            generatedImageContainer.style.display = 'block';
        }
    }
    
    if (saveButton) {
        saveButton.disabled = false;
    }
}
// ★ showVideoModal, hideVideoModal, updateRecordingUI は削除