/**
 * src/controllers/diagnosis.js
 *
 * 診断リクエスト (requestDiagnosis) のロジック
 */

const logger = require("firebase-functions/logger");
// ★↓ここが重要です。 gemini.js を正しく読み込んでいるか確認してください
const { callGeminiApiWithRetry } = require("../services/gemini");
const { AI_RESPONSE_SCHEMA, getDiagnosisSystemPrompt } = require("../prompts/diagnosisPrompts");

/**
 * 診断リクエストのメインコントローラー
 * @param {object} req - Expressリクエストオブジェクト
 * @param {object} res - Expressレスポンスオブジェクト
 * @param {object} dependencies - 依存関係
 * @param {object} dependencies.llmApiKey - APIキー(Secret)
 */
async function requestDiagnosisController(req, res, dependencies) {
  const { llmApiKey } = dependencies;

  // 1. メソッドとAPIキーのチェック
  if (req.method !== "POST") {
    logger.warn("[requestDiagnosis] Method Not Allowed: " + req.method);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = llmApiKey.value();
  if (!apiKey) {
    logger.error("[requestDiagnosis] LLM_APIKEY is missing.");
    return res.status(500).json({ error: "Configuration Error", message: "API Key not configured." });
  }

  // 2. リクエストデータの取得
  const { fileUrls, userProfile, gender, userRequestsText } = req.body;
  if (!fileUrls || !userProfile || !gender) {
    logger.error("[requestDiagnosis] Bad Request: Missing data.", { body: req.body });
    return res.status(400).json({ error: "Bad Request", message: "Missing required data (fileUrls, userProfile, gender)." });
  }

  const requiredKeys = ["item-front-photo", "item-side-photo", "item-back-photo", "item-front-video", "item-back-video"];
  const missingKeys = requiredKeys.filter((key) => !fileUrls[key]);
  if (missingKeys.length > 0) {
    logger.error(`[requestDiagnosis] Bad Request: Missing fileUrls: ${missingKeys.join(", ")}`);
    return res.status(400).json({ error: "Bad Request", message: `Missing required fileUrls: ${missingKeys.join(", ")}` });
  }

  logger.info(`[requestDiagnosis] Received request for user: ${userProfile.firebaseUid || userProfile.userId}`);
  if (userRequestsText) {
    logger.info(`[requestDiagnosis] User requests: ${userRequestsText}`);
  }

  // 3. 5つのファイルすべてを fetch して Base64 に変換
  const parts = [
    { text: `この顧客（性別: ${gender}）を診断し、提案してください。` },
  ];

  try {
    logger.info("[requestDiagnosis] Fetching 5 files from Storage...");

    // 必須の5ファイル
    const fetchPromises = requiredKeys.map(async (key) => {
      const url = fileUrls[key];
      const mimeType = key.includes("video") ?
        (url.includes(".mp4") ? "video/mp4" : "video/quicktime") :
        (url.includes(".png") ? "image/png" : "image/jpeg");

      logger.info(`[requestDiagnosis] Fetching ${key} (Type: ${mimeType}) from ${url.substring(0, 50)}...`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${key}: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      logger.info(`[requestDiagnosis] Fetched ${key} successfully. Base64 Length: ${base64.length}`);

      return {
        inlineData: {
          mimeType: mimeType,
          data: base64,
        },
      };
    });

    // ★ 追加: ご希望写真 (inspiration-photo) があれば、それも追加
    if (fileUrls["item-inspiration-photo"]) {
      const url = fileUrls["item-inspiration-photo"];
      logger.info(`[requestDiagnosis] Fetching inspiration-photo...`);
      const mimeType = (url.includes(".png") ? "image/png" : "image/jpeg");

      fetchPromises.push(
        (async () => {
          const response = await fetch(url);
          if (!response.ok) throw new Error("Failed to fetch inspiration-photo");
          const arrayBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          logger.info(`[requestDiagnosis] Fetched inspiration-photo successfully.`);
          return {
            inlineData: { mimeType: mimeType, data: base64 },
          };
        })(),
      );
      parts.push({ text: "添付の最後は、顧客が希望する参考スタイル写真です。" });
    }

    const fetchedParts = await Promise.all(fetchPromises);
    parts.push(...fetchedParts);

    logger.info("[requestDiagnosis] All files fetched and converted to Base64 successfully.");
  } catch (fetchError) {
    logger.error("[requestDiagnosis] Failed to fetch or process files:", fetchError);
    return res.status(500).json({ error: "File Fetch Error", message: `ファイル（画像・動画）の取得に失敗しました: ${fetchError.message}` });
  }

  // 4. Gemini API リクエストペイロードの作成
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  // ★ 外部モジュールからプロンプトとスキーマを取得
  const systemPrompt = getDiagnosisSystemPrompt(gender, userRequestsText);

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: parts, // 5つ(or 6つ)のファイル(Base64) + テキストプロンプト
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: AI_RESPONSE_SCHEMA,
    },
  };

  // 5. API呼び出し（リトライ処理付き）
  try {
    const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
    if (!aiResponse) {
      throw new Error("AI response was null or undefined after retries.");
    }

    logger.info("[requestDiagnosis] Gemini API request successful.");

    const responseText = aiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText || typeof responseText !== "string") {
      logger.error("[requestDiagnosis] No valid JSON text found in AI response.", { response: aiResponse });
      throw new Error("AIの応答にJSONテキストが含まれていません。");
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (parseError) {
      logger.error("[requestDiagnosis] Failed to parse responseText directly.", { responseText, parseError });
      throw new Error(`AIが不正なJSON形式を返しました: ${parseError.message}`);
    }

    // パースしたJSONをチェック
    if (!parsedJson.result || !parsedJson.proposal ||
      !parsedJson.result.hairCondition || !parsedJson.result.hairCondition.currentLevel ||
      !parsedJson.proposal.fashion ||
      !parsedJson.proposal.haircolors || !parsedJson.proposal.haircolors.color1 ||
      !parsedJson.proposal.haircolors.color1.recommendedLevel
    ) {
      logger.error("[requestDiagnosis] Parsed JSON missing required keys (result/proposal/hairCondition/currentLevel/fashion/recommendedLevel).", { parsed: parsedJson });
      throw new Error("AIの応答に必要なキー（currentLevel, recommendedLevelなど）が欠けています。");
    }

    // ★ HTMLエンティティの除去 (Sanitizer)
    const sanitizedJson = sanitizeObject(parsedJson);

    return res.status(200).json(sanitizedJson); // パース＆サニタイズしたJSONを返す
  } catch (apiError) {
    logger.error("[requestDiagnosis] Gemini API call failed:", apiError);
    return res.status(500).json({ error: "Gemini API Error", message: `AI診断リクエストの送信に失敗しました。\n詳細: ${apiError.message}` });
  }
}

/**
 * 文字列内のHTMLエンティティをデコードする
 * 特に &#x2F; (/) など、AIが生成しがちなものを対象とする
 */
function decodeHtmlEntities(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * オブジェクト内の全文字列プロパティを再帰的にサニタイズする
 */
function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return decodeHtmlEntities(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = sanitizeObject(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

module.exports = {
  requestDiagnosisController,
};