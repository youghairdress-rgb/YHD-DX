/**
 * src/prompts/imageGenPrompts.js
 *
 * 画像生成 (フェーズ6) のためのAIプロンプトを定義する
 */

/**
 * 最初の画像生成（インペインティング）用プロンプトを生成する
 * @param {object} data - リクエストデータ
 * @param {string} data.hairstyleName - スタイル名
 * @param {string} data.hairstyleDesc - スタイル説明
 * @param {string} data.haircolorName - カラー名
 * @param {string} data.haircolorDesc - カラー説明
 * @param {string} data.recommendedLevel - 推奨JHCAレベル
 * @param {string} data.currentLevel - 現在のJHCAレベル
 * @param {string} data.userRequestsText - 顧客の要望 (任意)
 * @param {boolean} data.hasInspirationImage - ご希望写真の有無
 * @return {string} - Gemini API に渡すプロンプト
 */
function getGenerationPrompt(data) {
  const {
    hairstyleName, hairstyleDesc, haircolorName, haircolorDesc,
    recommendedLevel, currentLevel, userRequestsText, hasInspirationImage,
  } = data;

  // ユーザーの要望テキストが空でない場合、プロンプトに差し込む
  const requestPromptPart = userRequestsText
    ? `
**顧客の要望（任意）:**
「${userRequestsText}」
この要望も可能な限りスタイルに反映させてください。
`
    : "";

  // ご希望写真がある場合、プロンプトに差し込む
  const inspirationPromptPart = hasInspirationImage
    ? `
**参考画像:**
[添付された2枚目の画像（ご希望スタイル写真）]
この参考画像（2枚目）の**雰囲気やスタイルを強く意識**し、元画像（1枚目）の顧客に適用してください。
`
    : "";

  return `
（指示書: PDF 2-5ページ）
**目的:** 元画像（1枚目）の顔の特徴（顔の輪郭、目、鼻、口、肌の質感）を一切変更せず、指定されたヘアスタイルを極めて自然に合成（インペインティング）する。
**元画像:** [添付された1枚目の画像（顧客の顔写真）]
${inspirationPromptPart}
**顧客の現在の髪の明るさ:** ${currentLevel} (JHCAレベルスケール)
**マスク:** [マスクは添付しない。元画像から顔領域を自動検出し、その顔を**一切変更せず**、髪型だけをインペインティングすること。]

**指示:**
1.  **品質:** masterpiece, best quality, photorealistic hair, ultra realistic, lifelike hair texture, individual hair strands visible
2.  **スタイル:** ${hairstyleName} (${hairstyleDesc})
3.  **カラー:** ${haircolorName} (${haircolorDesc})
4.  **明るさ(最重要):** 提案する髪の明るさは **JHCAレベルスケールの ${recommendedLevel}** である。顧客の現在の明るさ（${currentLevel}）と比較し、現実的な範囲で ${recommendedLevel} の明るさを再現すること。
5.  **光:** 元画像の照明（soft natural daylight, bright studio lightingなど）と一致させること。
6.  **質感:** soft and airy texture, glossy and sleek など、スタイルに合わせた自然な質感。
${requestPromptPart}
**ネガティブプロンプト:**
unnatural color, flat, dull, lifeless hair, helmet-like, wig, hat, hair accessories, blurry, deformed, worst quality, (face changed), (skin texture changed), (different person)
`;
}

/**
 * 画像微調整（Edit）用プロンプトを生成する
 * @param {string} refinementText - ユーザーの微調整指示
 * @return {string} - Gemini API に渡すプロンプト
 */
function getRefinementPrompt(refinementText) {
  return `
**目的:** 添付されたベース画像（ヘアスタイル合成済み）に対して、ユーザーの指示に基づき「髪の毛のみ」を微調整する。
**ベース画像:** [添付された画像]
**ユーザーの微調整指示:** "${refinementText}"
**厳格なルール:**
1.  **顔と背景の保護:** 顔の輪郭、目、鼻、口、肌の質感、背景は**一切変更してはならない**。
2.  **髪のみ編集:** ユーザーの指示（"${refinementText}"）を、**髪の毛に対してのみ**適用すること。
3.  **明るさの考慮:** もしユーザーが明るさ（例：「もっと明るく」）について言及した場合、**JHCAレベルスケール**（例：10レベルから12レベルへ）の変更として解釈し、現実的な範囲で適用すること。
4.  **品質:** photorealistic, lifelike hair texture を維持すること。

**ネガティブプロンプト:**
(face changed), (skin texture changed), (different person), (background changed), blurry, deformed, worst quality, unnatural color
`;
}

module.exports = {
  getGenerationPrompt,
  getRefinementPrompt,
};