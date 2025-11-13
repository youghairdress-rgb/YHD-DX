// --- 汎用ヘルパー関数 (依存なし) ---

/**
 * グローバルなフォールバック関数 (initializeAppFailureFallback) を呼び出す
 * @param {string} errorMessage 
 */
export function initializeAppFailure(errorMessage) {
    console.error("[initializeAppFailure] Displaying failure message:", errorMessage);
    hideLoadingScreen();
    // window.initializeAppFailureFallback は index.html のグローバルスコープで定義されている
    if (window.initializeAppFailureFallback) {
        window.initializeAppFailureFallback(errorMessage);
    } else {
        // フォールバック
        alert(`アプリケーションエラー:\n${errorMessage}`);
    }
}

/**
 * ローディングスクリーンを非表示にする
 */
export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen && loadingScreen.style.display !== 'none') {
        console.log("[hideLoadingScreen] Hiding loading screen.");
        loadingScreen.style.display = 'none';
    } else if (!loadingScreen) {
        console.warn("[hideLoadingScreen] Loading screen element not found.");
    }
}

/**
 * HTML文字列をエスケープする
 * (window.escapeHtml がグローバルに存在しない場合のフォールバック)
 * @param {string} unsafe 
 * @returns {string}
 */
export const escapeHtml = window.escapeHtmlFallback || function(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/\//g, "&#x2F;");
};

/**
 * IDを指定して要素にテキストを設定 (input/textareaにも対応)
 * @param {string} elementId 
 * @param {string} text 
 */
export function setTextContent(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        // input, textarea, select の場合は .value を使用
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            element.value = text || '';
        } else {
            // p, span, div, h1-h6 などの場合は .textContent を使用
            element.textContent = text || '';
        }
    } else {
        console.warn(`[setTextContent] Element with ID "${elementId}" not found.`);
    }
}

/**
 * 診断結果表示用のDOM要素ペアを作成
 * @param {string} label 
 * @param {string} value 
 * @returns {HTMLElement[]}
 */
export function createResultItem(label, value) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'result-item-label';
    labelDiv.textContent = label;
    const valueDiv = document.createElement('div');
    valueDiv.className = 'result-item-value';
    valueDiv.textContent = escapeHtml(value || 'N/A');
    return [labelDiv, valueDiv];
}

/**
 * Base64データURLをBlobに変換
 * @param {string} base64 
 * @param {string} mimeType 
 * @returns {Blob|null}
 */
export function base64ToBlob(base64, mimeType) {
    // console.log(`[base64ToBlob] Converting ${mimeType}`);
    try {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    } catch (e) {
        console.error("[base64ToBlob] Error converting base64:", e);
        return null;
    }
}

/**
 * ★★★ 新規追加: 画像圧縮ヘルパー ★★★
 * 画像ファイルを指定した最大幅にリサイズし、JPEG品質で圧縮する
 * @param {File} file - 元の画像ファイル
 * @param {number} maxWidth - 最大幅 (これを超える場合はリサイズ)
 * @param {number} quality - JPEGの品質 (0.0 - 1.0)
 * @returns {Promise<File>} - 圧縮後のFileオブジェクト
 */
export function compressImage(file, maxWidth = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
        // HEIC/HEIFの場合は圧縮をスキップ (canvasが非対応のため)
        if (file.type === 'image/heic' || file.type === 'image/heif') {
            console.warn(`[compressImage] Skipping compression for HEIC/HEIF: ${file.name}`);
            resolve(file);
            return;
        }

        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            if (typeof e.target.result !== 'string') {
                return reject(new Error('FileReader did not return a string.'));
            }
            img.src = e.target.result;
        };
        reader.onerror = (e) => reject(new Error(`FileReader error: ${e}`));
        reader.readAsDataURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // 最大幅を超える場合はリサイズ
            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Failed to get canvas context.'));
            }

            ctx.drawImage(img, 0, 0, width, height);

            // canvas.toBlob (JPEG, 品質指定)
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        return reject(new Error('Canvas toBlob failed.'));
                    }
                    // 元のファイル名（拡張子抜き） + .jpg で新しいFileオブジェクトを作成
                    const fileNameBase = file.name.split('.').slice(0, -1).join('.') || 'compressed';
                    const compressedFile = new File([blob], `${fileNameBase}.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    console.log(`[compressImage] Original: ${(file.size / 1024 / 1024).toFixed(2)}MB. Compressed: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
                    resolve(compressedFile);
                },
                'image/jpeg',
                quality
            );
        };
        img.onerror = (e) => reject(new Error(`Image load error: ${e}`));
    });
}


// ▼▼▼ ★★★ 新規追加: 動画録画ヘルパー ★★★ ▼▼▼

/**
 * MediaRecorder を使用して3秒間の動画を録画する
 * @param {boolean} useFrontCamera - true: インカメラ, false: アウトカメラ (★修正: この引数は main.js から渡されるが、ロジックは 'environment' に固定)
 * @param {function} onCountdown - (count) => {} 形式のカウントダウンコールバック
 * @returns {Promise<File>} - 録画された動画のFileオブジェクト
 */
export function recordVideo(useFrontCamera, onCountdown) {
    return new Promise(async (resolve, reject) => {
        let stream = null;
        let mediaRecorder = null;
        let videoChunks = [];
        let countdownInterval = null;

        try {
            // 1. ユーザーメディア（カメラ）の取得
            const constraints = {
                video: {
                    // ▼▼▼ ★★★ 修正: useFrontCamera 引数に関わらず、常に 'environment' (アウトカメラ) を使用 ★★★ ▼▼▼
                    facingMode: 'environment', 
                    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
                    width: { ideal: 640 }, // 解像度を抑えてファイルサイズを小さく
                },
                audio: false // 音声は不要
            };
            
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // プレビューを <video> 要素に接続 (main.js側で実施)
            const preview = document.getElementById('video-preview');
            preview.srcObject = stream;
            // ▼▼▼ ★★★ 修正: 常にアウトカメラなので、鏡写しを解除 ('scaleX(1)') ★★★ ▼▼▼
            preview.style.transform = 'scaleX(1)';
            // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

            // 2. MediaRecorder の準備
            // H.264 (mp4) を優先し、利用できなければデフォルト (webm) を使用
            const options = MediaRecorder.isTypeSupported('video/mp4; codecs=h264')
                ? { mimeType: 'video/mp4; codecs=h264' }
                : {};
            
            mediaRecorder = new MediaRecorder(stream, options);
            const fileExtension = options.mimeType ? '.mp4' : '.webm';
            console.log(`[recordVideo] Using mimeType: ${mediaRecorder.mimeType}`);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    videoChunks.push(event.data);
                    // console.log(`[recordVideo] Data available: ${event.data.size} bytes`);
                }
            };

            mediaRecorder.onstop = () => {
                // console.log("[recordVideo] Recording stopped.");
                if (countdownInterval) clearInterval(countdownInterval);
                
                // ストリームを停止 (カメラをオフ)
                stream?.getTracks().forEach(track => track.stop());
                preview.srcObject = null;

                if (videoChunks.length === 0) {
                     console.warn("[recordVideo] No data recorded.");
                     return reject(new Error("録画データが空です。"));
                }

                // 録画データをBlob -> Fileオブジェクトに変換
                const videoBlob = new Blob(videoChunks, { type: mediaRecorder.mimeType });
                const fileName = `recording_${Date.now()}${fileExtension}`;
                const videoFile = new File([videoBlob], fileName, { type: mediaRecorder.mimeType });
                
                console.log(`[recordVideo] Video file created: ${videoFile.name}, Size: ${(videoFile.size / 1024).toFixed(1)} KB`);
                resolve(videoFile);
            };
            
            mediaRecorder.onerror = (event) => {
                 console.error("[recordVideo] MediaRecorder error:", event.error);
                 reject(new Error(`録画中にエラーが発生しました: ${event.error.name}`));
            };

            // 3. 録画とカウントダウンの開始
            videoChunks = []; // チャンクをリセット
            mediaRecorder.start();
            console.log("[recordVideo] Recording started...");

            let count = 3;
            onCountdown(count); // '3' を表示

            countdownInterval = setInterval(() => {
                count--;
                onCountdown(count); // '2', '1', '0' を表示
                
                if (count <= 0) {
                    // 4. 3秒後に停止
                    clearInterval(countdownInterval);
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }
            }, 1000);

        } catch (err) {
            console.error("[recordVideo] Error accessing camera:", err);
            // ストリームが開いている場合は閉じる
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                reject(new Error("カメラへのアクセスが拒否されました。ブラウザまたは端末の設定でカメラの許可を確認してください。"));
            } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
                // ▼▼▼ ★★★ 修正: エラーメッセージを 'アウトカメラ' に固定 ★★★ ▼▼▼
                reject(new Error(`指定されたカメラ（アウトカメラ）が見つかりませんでした。`));
                // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
            } else {
                reject(new Error(`カメラの起動に失敗しました: ${err.name} - ${err.message}`));
            }
        }
    });
}
// ▲▲▲ ★★★ 追加ここまで ★★★ ▲▲▲