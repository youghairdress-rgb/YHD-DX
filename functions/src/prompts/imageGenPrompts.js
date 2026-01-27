/**
 * src/prompts/imageGenPrompts.js
 *
 * 画像生成 (フェーズ6) のためのAIプロンプトを定義する
 * Phase 3-2 Update: 顔の保護強化、ライティング統合、質感向上のためのチューニング済み
 * + トーン選択機能対応
 */

/**
 * 最初の画像生成（インペインティング）用プロンプトを生成する
 * @param {object} data - リクエストデータ
 * @param {string} data.hairstyleName - スタイル名
 * @param {string} data.hairstyleDesc - スタイル説明
 * @param {string} data.haircolorName - カラー名
 * @param {string} data.haircolorDesc - カラー説明
 * @param {string} data.recommendedLevel - 推奨JHCAレベル (または指定トーン)
 * @param {string} data.currentLevel - 現在のJHCAレベル
 * @param {string} data.userRequestsText - 顧客の要望 (任意)
 * @param {boolean} data.hasInspirationImage - ご希望写真の有無
 * @param {boolean} data.isUserStyle - ご希望スタイル優先フラグ
 * @param {boolean} data.isUserColor - ご希望カラー優先フラグ
 * @param {boolean} data.hasToneOverride - トーン指定上書きフラグ
 * @return {string} - Gemini API に渡すプロンプト
 */
function getGenerationPrompt(data) {
  const {
    hairstyleName, hairstyleDesc, haircolorName, haircolorDesc,
    recommendedLevel, currentLevel, userRequestsText, hasInspirationImage,
    isUserStyle, isUserColor, hasToneOverride
  } = data;

  // ユーザーの要望テキストが空でない場合、プロンプトに差し込む
  const requestPromptPart = userRequestsText
    ? `
**USER REQUEST (Highest Priority):**
"${userRequestsText}"
(Ensure this specific request is reflected in the final look, overriding defaults if necessary.)
`
    : "";

  // ご希望写真がある場合
  const inspirationPromptPart = hasInspirationImage
    ? `
**STYLE REFERENCE IMAGE:**
[The 2nd image attached is the user's desired style reference]
- This reference image is CRITICAL. Use it as the ground truth for style/color details.
`
    : "";

  // スタイル指定の構築
  let styleInstruction;
  if (isUserStyle && hasInspirationImage) {
    styleInstruction = `
- **Style Name:** User's Desired Style
- **Style Description:** **STRICTLY COPY THE HAIRSTYLE SILHOUETTE, LENGTH, AND TEXTURE FROM THE REFERENCE IMAGE (Image 2).**
  - Ignore any other style descriptions.
  - Apply the exact hairstyle from Image 2 to the user in Image 1, adjusting naturally for head shape.
`;
  } else {
    styleInstruction = `
- **Style Name:** ${hairstyleName}
- **Style Description:** ${hairstyleDesc}
`;
  }

  // カラー指定の構築
  // トーン指定がある場合は、それを明るさの基準として強制する
  let colorInstruction;
  const toneInstruction = hasToneOverride
    ? `**IMPORTANT:** The user has explicitly selected **${recommendedLevel}**. You MUST adjust the brightness to match this specific tone level strictly, regardless of the color name.`
    : `**Target Brightness:** ${recommendedLevel} (JHCA Level Scale)\n  - *Logic:* Transform from current ${currentLevel} to ${recommendedLevel}.`;

  if (isUserColor && hasInspirationImage && !hasToneOverride) {
    // ご希望カラーかつトーン指定なし -> 写真を完全コピー
    colorInstruction = `
- **Color Name:** User's Desired Color
- **Color Description:** **STRICTLY COPY THE HAIR COLOR FROM THE REFERENCE IMAGE (Image 2).**
  - Match the hue, saturation, and brightness of the hair in Image 2.
`;
  } else if (isUserColor && hasInspirationImage && hasToneOverride) {
    // ご希望カラーかつトーン指定あり -> 色味は写真、明るさはトーン指定
    colorInstruction = `
- **Color Name:** User's Desired Color (Modified Brightness)
- **Color Description:** Extract the *hue/saturation* (color shade) from the REFERENCE IMAGE (Image 2), but adjust the *brightness* to match **${recommendedLevel}**.
`;
  } else {
    // AI提案カラー (またはトーン指定のみ)
    colorInstruction = `
- **Color Name:** ${haircolorName}
- **Color Description:** ${haircolorDesc}
- ${toneInstruction}
`;
  }

  return `
You are an expert AI Hair Stylist and Professional Photo Retoucher.
Your task is to perform high-precision **Virtual Hair Makeover (Inpainting)**.

**INPUT DATA:**
- **Base Image:** [1st Image] User's original photo.
- **Current Hair Brightness:** ${currentLevel} (Based on the detailed Tone Scale 1-18).
${inspirationPromptPart}

**EXECUTION GOAL:**
Generate a photorealistic image where the user's hairstyle is completely transformed, while **preserving their facial identity with 100% accuracy**.

**STRICT CONSTRAINTS (Safety & Identity):**
1.  **FACE PROTECTION IS ABSOLUTE:** Do NOT modify the user's eyes, nose, mouth, skin texture, or facial contours. The face must remain *pixel-perfectly* recognizable.
2.  **NATURAL BLENDING:** The boundary between the face and the new hair (hairline, ears, neck) must be seamless. No jagged edges or blur.
3.  **LIGHTING MATCH:** Analyze the lighting direction, intensity, and color temperature of the Base Image. Apply the *exact same lighting* to the new hair.

**TARGET STYLE SPECIFICATIONS:**
${styleInstruction}
${colorInstruction}

${requestPromptPart}

**QUALITY PROMPTS:**
(masterpiece, best quality, 8k, raw photo, ultra-realistic), detailed hair strands, angelic ring (glossy hair), soft and airy texture, salon-finish blow dry, volumetric lighting, cinematic lighting, depth of field.

**NEGATIVE PROMPTS (Avoid these):**
(worst quality, low quality, sketch, cartoon, anime, 3d render), unnatural hairline, wig-like, helmet hair, stiff hair, split ends, frizzy, dry hair, messy, (face modification, changed eyes, changed nose, changed mouth), skin smoothing, makeup changes, extra fingers, deformed body, background distortion.
`;
}

/**
 * 画像微調整（Edit）用プロンプトを生成する
 * @param {string} refinementText - ユーザーの微調整指示
 * @return {string} - Gemini API に渡すプロンプト
 */
function getRefinementPrompt(refinementText) {
  return `
**TASK:** Precise Image Editing (Hair Only)
**INPUT:** [Base Image] A generated hairstyle image.
**USER INSTRUCTION:** "${refinementText}"

**EXECUTION RULES:**
1.  **SCOPE:** Apply the user's instruction **ONLY to the hair region**.
2.  **PROTECTION:** DO NOT change the face (eyes, nose, mouth), skin, or background. Keep the identity intact.
3.  **INTERPRETATION:**
    - If "Brighter/Lighter": Increase the Tone Level (e.g., Tone 7 -> Tone 9) while keeping the color tone.
    - If "Darker": Decrease the Tone Level (e.g., Tone 9 -> Tone 7).
    - If "Shorter/Longer": Adjust the hair length naturally, respecting the body structure.
4.  **QUALITY:** Maintain the "masterpiece, photorealistic" quality of the base image.

**NEGATIVE PROMPTS:**
(face changed), (background changed), low quality, blurry, distorted, unnatural physics, artifacts.
`;
}

module.exports = {
  getGenerationPrompt,
  getRefinementPrompt,
};