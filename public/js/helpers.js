/**
 * helpers.js
 * 汎用ヘルパー関数
 */

export const logger = {
  log: (...args) => console.log("[YHD App]", ...args),
  warn: (...args) => console.warn("[YHD App]", ...args),
  error: (...args) => console.error("[YHD App]", ...args),
};

// --- UI Helpers ---

export function initializeAppFailure(errorMessage) {
    console.error("[initializeAppFailure]", errorMessage);
    hideLoadingScreen();
    if (window.initializeAppFailureFallback) {
        window.initializeAppFailureFallback(errorMessage);
    } else {
        alert(`アプリケーションエラー:\n${errorMessage}`);
    }
}

export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';
}

export const escapeHtml = function(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/\//g, "&#x2F;");
};

export function setTextContent(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            element.value = text || '';
        } else {
            element.textContent = text || '';
        }
    }
}

export function createResultItem(label, value) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'result-item-label';
    labelDiv.textContent = label;
    
    const valueDiv = document.createElement('div');
    valueDiv.className = 'result-item-value';
    valueDiv.textContent = escapeHtml(value || 'N/A');
    
    return [labelDiv, valueDiv];
}

export function base64ToBlob(base64, mimeType) {
    try {
        const bin = atob(base64.replace(/^.*,/, ''));
        const buffer = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            buffer[i] = bin.charCodeAt(i);
        }
        return new Blob([buffer], { type: mimeType });
    } catch (e) {
        console.error("[base64ToBlob] Error:", e);
        return null;
    }
}

// --- Image Processing ---

export function compressImage(file, maxWidth = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file.type.match(/image.*/)) return reject(new Error('Not an image file'));
        if (file.type === 'image/heic' || file.type === 'image/heif') return resolve(file);

        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);

        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = Math.round((maxWidth / width) * height);
                width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('Compression failed'));
                const newName = file.name.replace(/\.[^.]+$/, '.jpg');
                resolve(new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() }));
            }, 'image/jpeg', quality);
        };
        img.onerror = (e) => reject(e);
    });
}
// ★ initCamera, recordVideo は削除 (ネイティブカメラ利用のため不要)