/**
 * state.js
 * アプリケーションの状態（State）を一元管理するモジュール
 */

// --- 開発・デバッグ設定 ---
// true にすると LIFF の初期化をスキップし、匿名認証で動作します
// LIFFブラウザで動作確認する場合は false にしてください
export const IS_DEV_MODE = true; 
export const USE_MOCK_AUTH = true; 

// --- 環境設定 (Dev: YHD-DX) ---
const CONFIG_DEV = {
    firebaseConfig: {
        apiKey: "AIzaSyBiOdjn2UWTSJS9HSyiLHMhCA6bHTqBvCw",
        authDomain: "yhd-dx.firebaseapp.com",
        projectId: "yhd-dx",
        storageBucket: "yhd-dx.firebasestorage.app",
        messagingSenderId: "232403760075",
        appId: "1:232403760075:web:14c42501c107eb88e77c4e",
        measurementId: "G-LNYEYSP7RV"
    },
    // Dev用 LIFF ID (元のファイルから復元)
    liffId: "2008345232-zq4A3Vg3",
    // API Base URL (HostingのRewriteを利用するため、自身のオリジンを指定)
    // ローカル開発でFunctionsエミュレータを使う場合は http://localhost:5001/yhd-dx/us-central1 などに変更
    apiBaseUrl: "https://yhd-dx.web.app" 
};

// --- アプリケーションステート ---
export const appState = {
    // 1. 設定関連
    liffId: CONFIG_DEV.liffId,
    apiBaseUrl: CONFIG_DEV.apiBaseUrl,
    
    // ★ 修正: firebaseConfig を追加
    firebaseConfig: CONFIG_DEV.firebaseConfig,

    // 2. Firebase インスタンス (main.js で初期化後に格納)
    firebase: {
        app: null,
        auth: null,
        storage: null,
        firestore: null,
        functions: null // (互換性のため維持)
    },
    
    // 3. ユーザー情報
    userProfile: {
        userId: null, // LINE User ID
        displayName: null, // LINE Display Name
        pictureUrl: null,
        firebaseUid: null, // Firebase Auth UID (Firestore/Storageのパスに使用)
        viaAdmin: false
    },
    
    // 4. 入力データ
    gender: 'female', // デフォルト性別 (female/male/other)
    
    // アップロードされたファイルのURL (Firebase Storage Download URL)
    uploadedFileUrls: {
        'item-front-photo': null,
        'item-side-photo': null,
        'item-back-photo': null,
        'item-front-video': null,
        'item-back-video': null,
        'item-inspiration-photo': null // ご希望のスタイル写真
    },
    
    // ご希望写真のショートカット (uploadedFileUrls['item-inspiration-photo'] と同期)
    inspirationImageUrl: null, 

    // アップロード中のPromiseタスク管理
    uploadTasks: {}, 
    
    // 5. AI診断・提案結果
    aiDiagnosisResult: null, // フェーズ4の結果
    aiProposal: null,        // フェーズ5の結果

    // 提案に対するユーザーの選択状態
    selectedProposal: {
        hairstyle: 'style1', // style1 or style2
        haircolor: 'color1', // color1 or color2
        hairTone: ''         // ★追加: 選択されたトーン (例: "Tone 7")
    },
    
    // 6. 生成画像データ (フェーズ6)
    generatedImageDataBase64: null, // 生成された画像のBase64データ
    generatedImageMimeType: null,   // 生成された画像のMIMEタイプ
};