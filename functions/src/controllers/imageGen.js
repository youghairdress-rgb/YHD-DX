/**
 * src/controllers/imageGen.js
 *
 * ヘアスタイル画像生成コントローラー
 * Vertex AI (Gemini 2.5 Flash Image Preview) を使用して、
 * ユーザーの顔写真を維持したまま、指定された髪型・髪色に合成する。
 */

const logger = require("firebase-functions/logger");
const { callGeminiApiWithRetry } = require("../services/gemini");
const { getGenerationPrompt, getRefinementPrompt } = require("../prompts/imageGenPrompts");

// ユーティリティ: 画像URLからBase64を取得
async function fetchImageAsBase64(url, logKey) {
  logger.info(`[fetchImageAsBase64] Fetching ${logKey} from: ${url.substring(0, 50)}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${logKey}: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type");
  const mimeType = (contentType && (contentType === "image/png" || contentType === "image/jpeg"))
    ? contentType
    : "image/jpeg"; // デフォルト

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  logger.info(`[fetchImageAsBase64] ${logKey} fetched successfully. MimeType: ${mimeType}`);
  return { base64, mimeType };
}

/**
 * ヘアスタイル生成のリクエストを処理する
 * @param {object} req - Expressリクエストオブジェクト
 * @param {object} res - Expressレスポンスオブジェクト
 * @param {object} dependencies - 依存関係
 * @param {object} dependencies.imageGenApiKey - APIキー(Secret)
 * @param {object} dependencies.storage - Firebase Storage サービス
 */
async function generateHairstyleImageController(req, res, dependencies) {
  const { imageGenApiKey, storage } = dependencies;

  // 1. メソッドとAPIキーのチェック
  if (req.method !== "POST") {
    logger.warn(`[generateHairstyleImage] Method Not Allowed: ${req.method}`);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = imageGenApiKey.value() ? imageGenApiKey.value().trim() : "";
  if (!apiKey || !storage) {
    logger.error("[generateHairstyleImage] API Key or Storage service is missing.");
    return res.status(500).json({ error: "Configuration Error", message: "API Key or Storage not configured." });
  }

  // 2. リクエストデータの取得
  const {
    originalImageUrl,
    firebaseUid,
    hairstyleName,
    hairstyleDesc,
    haircolorName,
    haircolorDesc,
    recommendedLevel,
    currentLevel,
    userRequestsText,
    inspirationImageUrl,
    isUserStyle,
    isUserColor,
    hasToneOverride
  } = req.body;

  if (!originalImageUrl || !firebaseUid || !hairstyleName || !haircolorName || !currentLevel) {
    logger.error("[generateHairstyleImage] Bad Request: Missing required data.", { body: req.body });
    return res.status(400).json({ error: "Bad Request", message: "Missing required data." });
  }

  logger.info(`[generateHairstyleImage] Received request for user: ${firebaseUid}`);

  // 4. Gemini API リクエストペイロードの作成
  // Model: Corrected to gemini-2.5-flash-image
  // Model: gemini-2.5-flash-image (Restored per user request - confirmed working previously)
  const modelName = "gemini-2.5-flash-image";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  logger.info(`[generateHairstyleImage] Using Model: ${modelName}`);

  const prompt = getGenerationPrompt({
    hairstyleName,
    hairstyleDesc,
    haircolorName,
    haircolorDesc,
    recommendedLevel,
    currentLevel,
    userRequestsText: userRequestsText || "",
    hasInspirationImage: !!inspirationImageUrl,
    isUserStyle: !!isUserStyle,
    isUserColor: !!isUserColor,
    hasToneOverride: !!hasToneOverride
  });

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };

  // 3. 画像データの取得 (元画像 + ご希望画像)
  try {
    // 3a. 元画像 (必須)
    const { base64: imageBase64, mimeType: imageMimeType } = await fetchImageAsBase64(originalImageUrl, "originalImage");
    payload.contents[0].parts.push({
      inlineData: { mimeType: imageMimeType, data: imageBase64 },
    });

    // 3b. ご希望写真 (任意)
    if (inspirationImageUrl) {
      const { base64: inspBase64, mimeType: inspMimeType } = await fetchImageAsBase64(inspirationImageUrl, "inspirationImage");
      payload.contents[0].parts.push({
        inlineData: { mimeType: inspMimeType, data: inspBase64 },
      });
      logger.info("[generateHairstyleImage] Inspiration image added to payload.");
    }
  } catch (fetchError) {
    logger.error("[generateHairstyleImage] Failed to fetch or process image(s):", fetchError);
    // Return detailed error to client
    return res.status(500).json({ error: "Image Fetch Error", message: `画像の取得に失敗しました: ${fetchError.message}` });
  }

  // 5. API呼び出し（リトライ処理付き）
  try {
    const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
    const imagePart = aiResponse?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    const generatedBase64 = imagePart?.inlineData?.data;
    const generatedMimeType = imagePart?.inlineData?.mimeType || "image/png"; // デフォルト

    if (!generatedBase64) {
      logger.error("[generateHairstyleImage] No image data found. Response:", JSON.stringify(aiResponse));
      throw new Error("AIからの応答に画像データが含まれていませんでした。");
    }

    logger.info("[generateHairstyleImage] Gemini API request successful. Image generated.");

    return res.status(200).json({
      message: "Image generated successfully.",
      imageBase64: generatedBase64,
      mimeType: generatedMimeType,
    });
  } catch (apiError) {
    logger.error("[generateHairstyleImage] Gemini API call or Storage upload failed:", apiError);
    return res.status(500).json({ error: "Image Generation Error", message: `画像生成または保存に失敗しました。\n詳細: ${apiError.message}` });
  }
}

/**
 * 生成された画像の微調整 (Refinement)
 */
async function refineHairstyleImageController(req, res, dependencies) {
  const { imageGenApiKey, storage } = dependencies;

  if (req.method !== "POST") {
    logger.warn(`[refineHairstyleImage] Method Not Allowed: ${req.method}`);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = imageGenApiKey.value() ? imageGenApiKey.value().trim() : "";
  if (!apiKey || !storage) {
    logger.error("[refineHairstyleImage] API Key or Storage service is missing.");
    return res.status(500).json({ error: "Configuration Error", message: "API Key or Storage not configured." });
  }

  // 2. リクエストデータの取得
  const {
    generatedImageUrl,
    firebaseUid,
    refinementText,
  } = req.body;

  if (!generatedImageUrl || !firebaseUid || !refinementText) {
    logger.error("[refineHairstyleImage] Bad Request: Missing data.", { body: req.body });
    return res.status(400).json({ error: "Bad Request", message: "Missing required data." });
  }

  logger.info(`[refineHairstyleImage] Received request for user: ${firebaseUid}. Text: ${refinementText}`);

  // 3. 画像データの取得
  let imageBase64;
  let imageMimeType;
  try {
    const match = generatedImageUrl.match(/^data:(image\/.+);base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid Data URL format.");
    }
    imageMimeType = match[1];
    imageBase64 = match[2];
  } catch (fetchError) {
    logger.error("[refineHairstyleImage] Failed to parse Data URL:", fetchError);
    return res.status(500).json({ error: "Image Parse Error", message: `画像データの解析に失敗しました: ${fetchError.message}` });
  }

  // 4. Gemini API リクエストペイロードの作成
  const modelName = "gemini-2.5-flash-image";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const prompt = getRefinementPrompt(refinementText);

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: imageMimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };

  // 5. API呼び出し
  try {
    const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
    const candidate = aiResponse?.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);

    if (!imagePart) {
      logger.error("[refineHairstyleImage] No image data. FinishReason:", candidate?.finishReason);
      logger.error("[refineHairstyleImage] Safety Ratings:", JSON.stringify(candidate?.safetyRatings));
      throw new Error("AIのセーフティフィルタ等の理由により画像が生成されませんでした。");
    }

    const generatedBase64 = imagePart.inlineData.data;
    const generatedMimeType = imagePart.inlineData.mimeType || "image/png";

    logger.info("[refineHairstyleImage] Gemini API request successful. Image refined.");

    return res.status(200).json({
      message: "Image refined successfully.",
      imageBase64: generatedBase64,
      mimeType: generatedMimeType,
    });
  } catch (apiError) {
    logger.error("[refineHairstyleImage] Gemini API call or Storage upload failed:", apiError);
    return res.status(500).json({ error: "Image Generation Error", message: `画像修正または保存に失敗しました。\n詳細: ${apiError.message}` });
  }
}

module.exports = {
  generateHairstyleImageController,
  refineHairstyleImageController,
};