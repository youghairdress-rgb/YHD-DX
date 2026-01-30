/**
 * src/prompts/imageGenPrompts.js
 *
 * 画像生成 (フェーズ6) のためのAIプロンプトを定義する
<<<<<<< HEAD
 * Phase 4-0 Update: "Ultimate Stylist" Edition
 * - 擬似LoRAアプローチによる髪質再現性の向上
 * - Chain-of-Thought (思考の連鎖) による顔・光・髪の完全な統合
 * - カメラレンズ仕様の指定による写実性の極限追求
=======
 * Phase 3-2 Update: 顔の保護強化、ライティング統合、質感向上のためのチューニング済み
 * + トーン選択機能対応
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8
 */

/**
 * 最初の画像生成（インペインティング）用プロンプトを生成する
 * @param {object} data - リクエストデータ
<<<<<<< HEAD
 * ... (引数は前回と同じ)
=======
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
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8
 */
function getGenerationPrompt(data) {
  const {
    hairstyleName, hairstyleDesc, haircolorName, haircolorDesc,
    recommendedLevel, currentLevel, userRequestsText, hasInspirationImage,
    isUserStyle, isUserColor, hasToneOverride
  } = data;

<<<<<<< HEAD
  // ユーザー要望
=======
  // ユーザーの要望テキストが空でない場合、プロンプトに差し込む
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8
  const requestPromptPart = userRequestsText
    ? `
**PRIORITY USER REQUEST:**
"${userRequestsText}"
(This instruction overrides standard style defaults. Execute with precision.)
`
    : "";

<<<<<<< HEAD
  // 参考画像 (Inspiration) - 分析指示を強化
=======
  // ご希望写真がある場合
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8
  const inspirationPromptPart = hasInspirationImage
    ? `
**REFERENCE IMAGE ANALYSIS (Image 2):**
- **Task:** Analyze the reference image (Image 2) for:
  1. Hair Texture (Smooth, Matte, Glossy, Frizzy?)
  2. Hair Density & Volume distribution
  3. Exact Color Nuance (Underlying pigments)
- **Action:** TRANSFER these exact physical properties to the user in the Base Image (Image 1).
`
    : "";

<<<<<<< HEAD
  // --- スタイル指定ロジック (構造定義) ---
  let styleInstruction;
  if (keepStyle) {
    styleInstruction = `
- **Style Goal:** MAINTAIN CURRENT FORM
- **Structural Rules:**
  - Freeze the silhouette, length, and layering of the user's hair.
  - Do NOT alter the geometry of the hairstyle.
  - Only modify surface properties (color/texture) as requested.
`;
  } else if (isUserStyle && hasInspirationImage) {
=======
  // スタイル指定の構築
  let styleInstruction;
  if (isUserStyle && hasInspirationImage) {
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8
    styleInstruction = `
- **Style Goal:** REPLICATE REFERENCE STYLE
- **Structural Rules:**
  - Clone the silhouette and form from Image 2.
  - Morph the reference style to fit the user's cranial structure naturally.
  - Ensure the hair falls physically correctly around the user's specific face shape.
`;
  } else {
    styleInstruction = `
- **Style Goal:** CREATE NEW STYLE (${hairstyleName})
- **Structural Rules:**
  - Design: ${hairstyleDesc}
  - Physique: Adjust volume and length to compliment the user's face shape.
`;
  }

<<<<<<< HEAD
  // --- カラー指定ロジック (色彩物理定義) ---
  let colorInstruction;
  // トーン（明度）の物理定義
  const toneInstruction = hasToneOverride 
      ? `**Luminance Target:** JHCA Level ${recommendedLevel} (Strictly adhere to this brightness value).`
      : `**Luminance Target:** Transform from current ${currentLevel} to target ${recommendedLevel}.`;

  if (keepColor) {
    if (hasToneOverride) {
         colorInstruction = `
- **Color Definition:** ORIGINAL HUE + ADJUSTED LUMINANCE
- **Pigment Rules:** Retain the original melanin/dye pigments. ONLY shift the exposure/brightness to match Level ${recommendedLevel}.
`;
    } else {
         colorInstruction = `
- **Color Definition:** PRESERVE ORIGINAL COLOR
- **Pigment Rules:** Do NOT shift hue, saturation, or brightness. Keep the hair color exactly as seen in Base Image.
`;
    }
  } else if (isUserColor && hasInspirationImage && !hasToneOverride) {
      colorInstruction = `
- **Color Definition:** CLONE REFERENCE COLOR
- **Pigment Rules:** Extract RGB/CMYK profile from Image 2's hair and map it to the user's hair in Image 1.
`;
  } else if (isUserColor && hasInspirationImage && hasToneOverride) {
      colorInstruction = `
- **Color Definition:** REFERENCE HUE + TARGET LUMINANCE
- **Pigment Rules:** Extract the Hue/Saturation from Image 2, but force the Brightness to match Level ${recommendedLevel}.
`;
  } else {
      colorInstruction = `
- **Color Definition:** ${haircolorName}
- **Pigment Rules:** ${haircolorDesc}
=======
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
>>>>>>> b81dfa61be4384c32e74a235b49e7df98fdff0c8
- ${toneInstruction}
`;
  }

  return `
You are the world's leading AI Hair Stylist and a VFX Artist specializing in Digital Human Compositing.
Your goal is to perform a **Seamless Hair Inpainting Operation**.

**INPUT DATA:**
- **Base Image (Image 1):** The Client. Treat their face and head shape as the immutable canvas.
- **Current State:** Hair Brightness Level ${currentLevel}.
${inspirationPromptPart}

**CHAIN OF THOUGHT (Step-by-Step Execution):**
1.  **ANALYZE:** Scan Image 1 to map the user's face, skin tone, head orientation, and the scene's lighting environment (HDR map).
2.  **MASK:** Mentally mask out the old hair region, strictly preserving the face (forehead, ears, jawline).
3.  **SIMULATE:** Generate the new hairstyle structure (${hairstyleName}) as a 3D volume that respects gravity and the user's head shape.
4.  **RENDER:** Apply the hair texture and color (${haircolorName}) with physically based rendering (PBR) to match the scene's lighting.
5.  **COMPOSITE:** Blend the new hair onto the head with sub-pixel accuracy at the hairline.

**STRICT CONSTRAINTS (The "Iron Rules"):**
1.  **IDENTITY PRESERVATION:** The face (eyes, nose, mouth, skin details, moles) MUST remain untouched. 0% alteration allowed.
2.  **PHYSICAL REALISM:** Hair must have weight, flow, and individual strands. No "helmet" hair.
3.  **LIGHTING CONSISTENCY:** If the face is lit from the right, the hair highlights MUST be on the right. Shadows must match.

**TARGET SPECIFICATIONS:**
${styleInstruction}
${colorInstruction}

${requestPromptPart}

**PHOTOGRAPHY & TEXTURE SPECS (The "Look"):**
- **Camera:** 85mm Portrait Lens, f/1.8 aperture (creates natural bokeh in background, sharp focus on eyes/hair).
- **Texture:** 8K resolution, individual keratin strands visible, cuticle reflection (angel ring), subsurface scattering (light passing through hair tips).
- **Atmosphere:** Professional salon photography, soft box lighting, high dynamic range.

**NEGATIVE PROMPTS:**
(low resolution, blurry, jpeg artifacts), (painting, drawing, sketch, anime, 3d render, plastic), (distorted face, changing face, new makeup), unnatural gravity, solid block of hair, jagged hairline, floating hair.
`;
}

/**
 * 画像微調整（Edit）用プロンプトを生成する
 * Chain-of-Thoughtを簡易的に適用し、指示の解像度を上げる
 */
function getRefinementPrompt(refinementText) {
  return `
**TASK:** High-End Photo Retouching (Hair Specific)
**INPUT:** [Base Image] A generated hairstyle image.
**USER INSTRUCTION:** "${refinementText}"

**PROCESS:**
1.  **Identify:** Locate the specific hair region relevant to the instruction (e.g., "bangs", "tips", "overall volume").
2.  **Modify:** Apply the change "${refinementText}" while maintaining the photorealistic texture established in the Base Image.
3.  **Blend:** Ensure the modified area integrates seamlessly with the rest of the hair and the background.

**INTERPRETATION LOGIC:**
- **"Brighter":** Increase exposure on hair strands, boost specular highlights.
- **"Darker":** Deepen shadows, reduce exposure, add richness to pigment.
- **"Shorter":** Retract hair length, ensuring ends look natural (not chopped).
- **"Volume Up":** Increase hair density and lift at the roots.

**CONSTRAINTS:**
- **FACE IS OFF-LIMITS:** Do not touch the face.
- **KEEP REALISM:** Maintain 8K texture quality. No blurring.

**NEGATIVE PROMPTS:**
(face change), (blur), (loss of detail), (artificial look), (painting).
`;
}

module.exports = {
  getGenerationPrompt,
  getRefinementPrompt,
};