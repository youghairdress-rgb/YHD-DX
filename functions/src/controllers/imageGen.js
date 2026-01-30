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
<<<<<<< HEAD
  logger.info(`[fetchImageAsBase64] ${logKey} fetched successfully. MimeType: ${mimeType}`);
=======
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8
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

  const apiKey = imageGenApiKey.value();
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
<<<<<<< HEAD
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
=======
  // Model: gemini-2.5-flash-image-preview (Experimental/Preview model heavily optimized for image gen/edit)
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8

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
    return res.status(500).json({ error: "Image Fetch Error", message: `画像の取得に失敗しました: ${fetchError.message}` });
  }

  // 5. API呼び出し（リトライ処理付き）
  try {
    const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
    const imagePart = aiResponse?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    const generatedBase64 = imagePart?.inlineData?.data;
    const generatedMimeType = imagePart?.inlineData?.mimeType || "image/png"; // デフォルト

    if (!generatedBase64) {
      logger.error("[generateHairstyleImage] No image data found in Gemini response.", { response: aiResponse });
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

  const apiKey = imageGenApiKey.value();
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
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
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
  };

  // 5. API呼び出し
  try {
    const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
    const imagePart = aiResponse?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    const generatedBase64 = imagePart?.inlineData?.data;
    const generatedMimeType = imagePart?.inlineData?.mimeType || "image/png";

    if (!generatedBase64) {
      logger.error("[refineHairstyleImage] No image data found in Gemini response.", { response: aiResponse });
      throw new Error("AIからの応答に画像データが含まれていませんでした。");
    }

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