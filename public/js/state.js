/**
 * state.js
 * アプリケーション全体の状態と設定を管理する
 */

// --- 環境設定 (Environment Configuration) ---
export const IS_DEV_MODE = true;
export const USE_MOCK_AUTH = true;

const CONFIG_PROD = {
    firebaseConfig: {
        apiKey: "AIzaSyD7f_GTwM7ee6AgMjwCRetyMNlVKDpb3_4",
        authDomain: "yhd-ai.firebaseapp.com",
        projectId: "yhd-ai",
        storageBucket: "yhd-ai.firebasestorage.app",
        messagingSenderId: "757347798313",
        appId: "1:757347798313:web:e64c91b4e8b0e8bfc33b38",
        measurementId: "G-D26PT4FYPR"
    },
    liffId: "2008345232-pVNR18m1",
    apiBaseUrl: "https://yhd-ai.web.app"
};

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
    liffId: "2008345232-zq4A3Vg3",
    apiBaseUrl: "https://yhd-dx.web.app"
};

const activeConfig = IS_DEV_MODE ? CONFIG_DEV : CONFIG_PROD;
console.log(`[State] Running in ${IS_DEV_MODE ? "DEVELOPMENT (YHD-DX)" : "PRODUCTION (YHD-AI)"} mode.`);

// --- Global App State ---
export const appState = {
    firebaseConfig: activeConfig.firebaseConfig,
    apiBaseUrl: activeConfig.apiBaseUrl,
    liffId: activeConfig.liffId,
    
    firebase: { 
        app: null, 
        auth: null, 
        storage: null, 
        firestore: null,
        functions: {
            storage: {},   
            firestore: {} 
        }
    },
    
    userProfile: {
        displayName: "ゲスト",
        userId: null,
        pictureUrl: null,
        statusMessage: null,
        firebaseUid: null,
        viaAdmin: false,
        adminCustomerName: null
    },
    gender: 'female',
    
    uploadTasks: {}, 
    uploadedFiles: {
        "item-front-photo": null,
        "item-side-photo": null,
        "item-back-photo": null,
        "item-front-video": null,
        "item-back-video": null,
        "item-inspiration-photo": null,
    },
    uploadedFileUrls: {},
    inspirationImageUrl: null,

    selectedProposal: { hairstyle: null, haircolor: null },
    aiDiagnosisResult: null,
    aiProposal: null,
    
    generatedImageUrl: null,
    generatedImageDataBase64: null,
    generatedImageMimeType: null,
};