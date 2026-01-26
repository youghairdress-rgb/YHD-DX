/**
 * src/controllers/imageGen.js
 *
 * 画像生成 (generateHairstyleImage) と
 * 画像微調整 (refineHairstyleImage) のロジック
 * 
 * Update: Vertex AI (Imagen 3) への移行
 */

const logger = require("firebase-functions/logger");
const admin = require("firebase-admin"); // Auth用
const { getGenerationPrompt, getRefinementPrompt } = require("../prompts/imageGenPrompts");

/**
 * Vertex AI: Gemini 1.5 Flash (Analysis)
 * 画像を分析して性別・年齢・特徴を抽出する
 */
async function callVertexGeminiAnalysis(base64Image, projectId, location = "us-central1") {
  // Model: gemini-1.5-flash-002 (Latest stable as of late 2024/2025)
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-1.5-flash-002:generateContent`;

  let accessToken;
  try {
    const tokenObj = await admin.credential.applicationDefault().getAccessToken();
    accessToken = tokenObj.access_token;
  } catch (e) { throw new Error("Internal Auth Error"); }

  const prompt = `
Analyze this face image and output a JSON object with the following keys:
- gender: "Male" or "Female"
- age: Estimated age range (e.g. "20s", "30s")
- faceShape: (e.g. "Round", "Oval", "Square")
- features: Brief description of key facial features (e.g. "Beard", "Glasses", "Mole", "Short hair")

Output JSON only.
`;

  const payload = {
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", data: base64Image } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`Analysis API Error: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  try {
    const cleanText = text.replace(/```json\n|\n```/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanText);
  } catch (e) {
    logger.warn("Failed to parse analysis JSON", e);
    return null;
  }
}


/**
 * Vertex AI (Imagen 3) APIを呼び出す
 * @param {string} prompt - 画像生成プロンプト
 * @param {string} projectId - Google Cloud Project ID
 * @param {string} location - リージョン (us-central1)
 * @param {object} options - 追加オプション (sampleCount, aspectRatio等)
 * @return {Promise<string>} - Base64画像データ
 */
async function callVertexImagen(prompt, projectId, location = "us-central1", options = {}) {
  // Imagen 3 endpoint
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`;

  // 1. アクセストークンの取得
  let accessToken;
  try {
    const tokenObj = await admin.credential.applicationDefault().getAccessToken();
    accessToken = tokenObj.access_token;
  } catch (e) {
    logger.error("[callVertexImagen] Failed to get Access Token:", e);
    throw new Error("Internal Auth Error: Could not get Google Cloud credentials.");
  }

  // 2. ペイロードの作成
  // Imagen 3 API形式
  const payload = {
    instances: [
      { prompt: prompt }
    ],
    parameters: {
      sampleCount: options.sampleCount || 1,
      aspectRatio: options.aspectRatio || "1:1",
      // add_watermark: true // デフォルトtrue
    }
  };

  logger.info(`[callVertexImagen] Calling endpoint: ${endpoint}`);

  // 3. API呼び出し
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[callVertexImagen] API Error: ${response.status}`, { errorText });
    throw new Error(`Vertex AI Error (${response.status}): ${errorText.substring(0, 200)}...`);
  }

  const data = await response.json();

  // 4. レスポンス解析
  const predictions = data.predictions;
  if (!predictions || predictions.length === 0) {
    throw new Error("No predictions found in Vertex AI response.");
  }

  // base64文字列を取得
  let base64Image = predictions[0];
  if (typeof base64Image === 'object' && base64Image.bytesBase64Encoded) {
    base64Image = base64Image.bytesBase64Encoded;
  } else if (typeof base64Image !== 'string') {
    logger.warn("[callVertexImagen] Unexpected prediction format:", JSON.stringify(predictions[0]));
    if (predictions[0].bytesBase64Encoded) base64Image = predictions[0].bytesBase64Encoded;
  }

  return base64Image;
}

/**
 * ユーティリティ: URLから画像を取得してBase64に変換 (ログ用・将来用)
 */
async function fetchImageAsBase64(url, logKey) {
  logger.info(`[fetchImageAsBase64] Fetching ${logKey} from: ${url.substring(0, 50)}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${logKey}: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type");
  const mimeType = (contentType && (contentType === "image/png" || contentType === "image/jpeg"))
    ? contentType
    : "image/jpeg";

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { base64, mimeType };
}

/**
 * 画像生成リクエストのメインコントローラー
 */
async function generateHairstyleImageController(req, res, dependencies) {
  const { imageGenApiKey, storage } = dependencies;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const {
    originalImageUrl, firebaseUid, hairstyleName, hairstyleDesc,
    haircolorName, haircolorDesc, recommendedLevel, currentLevel,
    userRequestsText, inspirationImageUrl, isUserStyle, isUserColor, hasToneOverride,
    keepStyle, keepColor
  } = req.body;

  if (!firebaseUid || !originalImageUrl) {
    return res.status(400).json({ error: "Bad Request", message: "Missing required data." });
  }

  logger.info(`[generateHairstyleImage] Processing for ${firebaseUid} via Vertex AI`);

  try {
    const projectId = process.env.GCLOUD_PROJECT || admin.app().options.projectId;
    if (!projectId) throw new Error("Project ID is missing.");

    // 1. 入力画像の取得 (分析用)
    const { base64: originalBase64 } = await fetchImageAsBase64(originalImageUrl, "OriginalImage");

    // 2. 画像分析 (Gemini 1.5 Flash)
    logger.info("[generateHairstyleImage] Analyzing user face...");
    const analysisData = await callVertexGeminiAnalysis(originalBase64, projectId);
    logger.info("[generateHairstyleImage] Analysis Result:", analysisData);

    // 3. Prompt作成 (分析データを注入)
    const prompt = getGenerationPrompt({
      hairstyleName, hairstyleDesc, haircolorName, haircolorDesc,
      recommendedLevel, currentLevel, userRequestsText: userRequestsText || "",
      hasInspirationImage: !!inspirationImageUrl,
      isUserStyle: !!isUserStyle, isUserColor: !!isUserColor, hasToneOverride: !!hasToneOverride,
      keepStyle: !!keepStyle, keepColor: !!keepColor,
      analysisData: analysisData // ★ 追加
    });

    // 4. Vertex AI (Imagen 3) 呼び出し
    logger.info("[generateHairstyleImage] Generating image...");
    const base64 = await callVertexImagen(prompt, projectId);

    return res.status(200).json({
      message: "Image generated successfully (Vertex AI Connected).",
      imageBase64: base64,
      mimeType: "image/png"
    });
  } catch (error) {
    logger.error("[generateHairstyleImage] Failed:", error);
    return res.status(500).json({
      error: "Vertex AI Error",
      message: `画像生成に失敗しました: ${error.message}`
    });
  }
}

async function refineHairstyleImageController(req, res, dependencies) {
  const { firebaseUid, refinementText } = req.body;
  if (!refinementText) return res.status(400).json({ error: "Missing text" });

  // プロンプトを工夫して「修正」のように見せる
  const prompt = getRefinementPrompt(refinementText);

  try {
    const projectId = process.env.GCLOUD_PROJECT || admin.app().options.projectId;
    if (!projectId) throw new Error("Project ID is missing.");

    const base64 = await callVertexImagen(prompt, projectId);
    return res.status(200).json({
      message: "Refined (Regenerated) successfully.",
      imageBase64: base64,
      mimeType: "image/png"
    });
  } catch (e) {
    logger.error("[refineHairstyleImage] Failed:", e);
    return res.status(500).json({ error: "Error", message: e.message });
  }
}

module.exports = {
  generateHairstyleImageController,
  refineHairstyleImageController,
};