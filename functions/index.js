/**
 * Firebase Functions v2 - エントリーポイント
 *
 * このファイルは、各モジュールで定義された関数をインポートし、
 * Firebase Functions v2 のエクスポート形式に合わせる役割のみを持ちます。
 *
 * 実際のロジックは /src 以下の各ファイルに記述されます。
 */

// Firebase SDK (Admin SDKの初期化は services/firebase.js で行う)
const logger = require("firebase-functions/logger");
const {defineSecret} = require("firebase-functions/params");

// --- サービス・コントローラーのインポート ---
// (src/services/firebase.js で admin.initializeApp() が実行される)
const { adminApp, auth, storage, defaultBucketName } = require("./src/services/firebase");
const { requestDiagnosisController } = require("./src/controllers/diagnosis");
const { generateHairstyleImageController, refineHairstyleImageController } = require("./src/controllers/imageGen");
const { createFirebaseCustomTokenController } = require("./src/services/line");
const { onRequest } = require("firebase-functions/v2/https");

// --- シークレットの定義 ---
// 各コントローラーで使用するシークレットをここで定義し、DI(依存性注入)で渡す
const llmApiKey = defineSecret("LLM_APIKEY");
const imageGenApiKey = defineSecret("IMAGEGEN_APIKEY");

// --- CORS設定 ---
const corsOptions = {
  cors: {
    origin: true, // 開発中はtrue (本番では "https://yhd-ai.web.app" 等を指定)
    methods: ["POST", "GET", "OPTIONS"],
  },
};

// --- 1. 診断リクエスト (フェーズ4) ---
exports.requestDiagnosis = onRequest(
    {
      ...corsOptions,
      secrets: [llmApiKey],
      timeoutSeconds: 300, // 5分
      memory: "2GiB",
    },
    async (req, res) => {
      // 依存性を注入してコントローラーを呼び出す
      await requestDiagnosisController(req, res, {
        llmApiKey: llmApiKey,
      });
    },
);

// --- 2. 画像生成リクエスト (フェーズ6) ---
exports.generateHairstyleImage = onRequest(
    {
      ...corsOptions,
      secrets: [imageGenApiKey],
      timeoutSeconds: 300, // 5分
    },
    async (req, res) => {
      // 依存性を注入してコントローラーを呼び出す
      await generateHairstyleImageController(req, res, {
        imageGenApiKey: imageGenApiKey,
        storage: storage, // Firebase Storage サービス
        defaultBucketName: defaultBucketName, // バケット名
      });
    },
);

// --- 3. 画像微調整リクエスト (フェーズ6) ---
exports.refineHairstyleImage = onRequest(
    {
      ...corsOptions,
      secrets: [imageGenApiKey],
      timeoutSeconds: 300,
    },
    async (req, res) => {
      // 依存性を注入してコントローラーを呼び出す
      await refineHairstyleImageController(req, res, {
        imageGenApiKey: imageGenApiKey,
        storage: storage, // Firebase Storage サービス
        defaultBucketName: defaultBucketName, // バケット名
      });
    },
);

// --- 4. 認証トークン生成 ---
exports.createFirebaseCustomToken = onRequest(
    {
      ...corsOptions,
      secrets: [], // シークレット不要
    },
    async (req, res) => {
      // 依存性を注入してコントローラーを呼び出す
      await createFirebaseCustomTokenController(req, res, {
        auth: auth, // Firebase Auth サービス
      });
    },
);

// --- 5. 疎通確認用 ---
exports.helloWorld = onRequest(corsOptions, (req, res) => {
  logger.info("[helloWorld] Hello world endpoint called!");
  res.status(200).send("Hello from Firebase Functions v2 (Modularized)!");
});