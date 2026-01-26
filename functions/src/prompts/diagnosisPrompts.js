/**
 * src/prompts/diagnosisPrompts.js
 *
 * 診断 (フェーズ4) と提案 (フェーズ5) のためのAIプロンプトとスキーマを定義する
 * Phase 4-0 Update: "Clinical Aesthetician" Edition
 * - 美容理論だけでなく、解剖学的・色彩学的な観点を取り入れた分析
 * - Chain-of-Thoughtによる論理的な診断推論
 */

// --- ★ AIレスポンスのJSONスキーマ定義 (変更なし) ★ ---
const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    "result": {
      "type": "OBJECT",
      "properties": {
        "face": {
          "type": "OBJECT",
          "properties": {
            "nose": { "type": "STRING", "description": "鼻の特徴 (例: 高い, 丸い)" },
            "mouth": { "type": "STRING", "description": "口の特徴 (例: 大きい, 薄い)" },
            "eyes": { "type": "STRING", "description": "目の特徴 (例: 二重, つり目)" },
            "eyebrows": { "type": "STRING", "description": "眉の特徴 (例: アーチ型, 平行)" },
            "forehead": { "type": "STRING", "description": "おでこの特徴 (例: 広い, 狭い)" },
          },
          "required": ["nose", "mouth", "eyes", "eyebrows", "forehead"],
        },
        "skeleton": {
          "type": "OBJECT",
          "properties": {
            "neckLength": { "type": "STRING", "description": "首の長さ (例: 長い, 短い, 標準)" },
            "faceShape": { "type": "STRING", "description": "顔の形 (例: 丸顔, 面長, ベース顔, 卵型)" },
            "bodyLine": { "type": "STRING", "description": "ボディライン (例: ストレート, ウェーブ, ナチュラル)" },
            "shoulderLine": { "type": "STRING", "description": "肩のライン (例: なで肩, いかり肩, 標準)" },
            "faceStereoscopy": { "type": "STRING", "description": "顔の立体感 (例: 立体的, 平面的, 標準)" },
            "bodyTypeFeature": { "type": "STRING", "description": "体型の特徴 (例: 上重心(ストレートタイプ), 下重心(ウェーブタイプ), 骨感が目立つ(ナチュラルタイプ))" },
          },
          "required": ["neckLength", "faceShape", "bodyLine", "shoulderLine", "faceStereoscopy", "bodyTypeFeature"],
        },
        "personalColor": {
          "type": "OBJECT",
          "properties": {
            "baseColor": { "type": "STRING", "description": "ベースカラー (例: イエローベース, ブルーベース)" },
            "season": { "type": "STRING", "description": "シーズン (例: スプリング, サマー, オータム, ウィンター)" },
            "brightness": { "type": "STRING", "description": "明度 (例: 高明度, 中明度, 低明度)" },
            "saturation": { "type": "STRING", "description": "彩度 (例: 高彩度, 中彩度, 低彩度)" },
            "eyeColor": { "type": "STRING", "description": "瞳の色 (例: 明るい茶色, 黒に近い焦げ茶)" },
          },
          "required": ["baseColor", "season", "brightness", "saturation", "eyeColor"],
        },
        "hairCondition": {
          "type": "OBJECT",
          "description": "写真（と将来の動画）から分析した現在の髪の状態",
          "properties": {
            "quality": { "type": "STRING", "description": "髪質 (例: 硬い, 柔らかい, 普通)" },
            "curlType": { "type": "STRING", "description": "クセ (例: 直毛, 波状毛, 捻転毛)" },
            "damageLevel": { "type": "STRING", "description": "ダメージレベル (例: 低(健康), 中(やや乾燥), 高(要ケア))" },
            "volume": { "type": "STRING", "description": "毛量 (例: 多い, 普通, 少ない)" },
            "currentLevel": { "type": "STRING", "description": "詳細なトーンレベルに基づく現在の明るさ (例: トーン7(ミディアムブラウン))" },
          },
          "required": ["quality", "curlType", "damageLevel", "volume", "currentLevel"],
        },
      },
      "required": ["face", "skeleton", "personalColor", "hairCondition"],
    },
    "proposal": {
      "type": "OBJECT",
      "properties": {
        "hairstyles": {
          "type": "OBJECT",
          "description": "提案するヘアスタイル2種。キーは 'style1', 'style2' とする。",
          "properties": {
            "style1": {
              "type": "OBJECT",
              "properties": {
                "name": { "type": "STRING", "description": "ヘアスタイルの名前 (例: くびれレイヤーミディ)" },
                "description": { "type": "STRING", "description": "スタイルの説明 (50-100文字程度)" },
              },
              "required": ["name", "description"],
            },
            "style2": {
              "type": "OBJECT",
              "properties": {
                "name": { "type": "STRING", "description": "ヘアスタイルのの名前 (例: シースルーバングショート)" },
                "description": { "type": "STRING", "description": "スタイルの説明 (50-100文字程度)" },
              },
              "required": ["name", "description"],
            },
          },
          "required": ["style1", "style2"],
        },
        "haircolors": {
          "type": "OBJECT",
          "description": "提案するヘアカラー2種。キーは 'color1', 'color2' とする。",
          "properties": {
            "color1": {
              "type": "OBJECT",
              "properties": {
                "name": { "type": "STRING", "description": "ヘアカラーの名前 (例: ラベンダーアッシュ)" },
                "description": { "type": "STRING", "description": "カラーの説明 (トレンドやブリーチ要否を含める)" },
                "recommendedLevel": { "type": "STRING", "description": "詳細なトーンレベルに基づく推奨明るさ (例: トーン11(ライトブラウン～ゴールド))" },
              },
              "required": ["name", "description", "recommendedLevel"],
            },
            "color2": {
              "type": "OBJECT",
              "properties": {
                "name": { "type": "STRING", "description": "ヘアカラーの名前 (例: ピンクベージュ)" },
                "description": { "type": "STRING", "description": "カラーの説明 (トレンドやブリーチ要否を含める)" },
                "recommendedLevel": { "type": "STRING", "description": "詳細なトーンレベルに基づく推奨明るさ (例: トーン13(ブライトゴールド))" },
              },
              "required": ["name", "description", "recommendedLevel"],
            },
          },
          "required": ["color1", "color2"],
        },
        "bestColors": {
          "type": "OBJECT",
          "description": "パーソナルカラーに基づいた相性の良いカラー4種。キーは 'c1' から 'c4'。",
          "properties": {
            "c1": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "hex": { "type": "STRING", "description": "例: #FFB6C1" } }, "required": ["name", "hex"] },
            "c2": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "hex": { "type": "STRING", "description": "例: #FFDAB9" } }, "required": ["name", "hex"] },
            "c3": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "hex": { "type": "STRING", "description": "例: #E6E6FA" } }, "required": ["name", "hex"] },
            "c4": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "hex": { "type": "STRING", "description": "例: #98FB98" } }, "required": ["name", "hex"] },
          },
          "required": ["c1", "c2", "c3", "c4"],
        },
        "makeup": {
          "type": "OBJECT",
          "description": "パーソナルカラーに基づいた似合うメイク提案",
          "properties": {
            "eyeshadow": { "type": "STRING", "description": "アイシャドウの色 (例: ゴールド系ブラウン)" },
            "cheek": { "type": "STRING", "description": "チークの色 (例: ピーチピンク)" },
            "lip": { "type": "STRING", "description": "リップの色 (例: コーラルレッド)" },
          },
          "required": ["eyeshadow", "cheek", "lip"],
        },
        "fashion": {
          "type": "OBJECT",
          "description": "骨格診断に基づいた似合うファッション提案",
          "properties": {
            "recommendedStyles": {
              "type": "ARRAY",
              "items": { "type": "STRING" },
              "description": "似合うファッションスタイル (2つ程度。例: Aライン, Iライン)",
            },
            "recommendedItems": {
              "type": "ARRAY",
              "items": { "type": "STRING" },
              "description": "似合うファッションアイテム (2つ程度。例: Vネックニット, テーパードパンツ)",
            },
          },
          "required": ["recommendedStyles", "recommendedItems"],
        },
        "comment": { "type": "STRING", "description": "AIトップヘアスタイリストによる総評 (200-300文字程度)" },
      },
      "required": ["hairstyles", "haircolors", "bestColors", "makeup", "fashion", "comment"],
    },
  },
  "required": ["result", "proposal"],
};

/**
 * 診断用のシステムプロンプトを生成する
 * @param {string} gender - 顧客の性別
 * @param {string} userRequestsText - 顧客の要望テキスト (任意)
 * @return {string} - Gemini API に渡すシステムプロンプト
 */
function getDiagnosisSystemPrompt(gender, userRequestsText = "") {
  // ユーザーの要望テキストが空でない場合、プロンプトに差し込む
  const requestPromptPart = userRequestsText
    ? `
## PRIORITY REQUEST
**Client's Wish:** "${userRequestsText}"
Integrate this wish into the diagnosis and proposal. If the wish contradicts the physical diagnosis (e.g., client wants a style not suitable for their bone structure), propose a compromise that respects both.
`
    : "";

  // Output Requirements
  return `
You are an **Expert Aesthetic Anatomist & Color Theory Specialist**.
Your task is to analyze the client's photos (and optional videos) to provide a highly personalized, professional hair and style diagnosis.

## 1. ANALYSIS PHASE (Internal Monologue - strict scientific approach)
- **Face Shape & Bone Structure:** Analyze ratios (vertical vs. horizontal), jawline angle, cheekbone prominence, and forehead width. Classify as Oval, Round, Square, Base (Pentagon), or Triangle.
- **Features:** Analyze eye shape/angle, nose prominence, and lip fullness.
- **Body Skeleton:** Estimate skeletal type (Straight, Wave, Natural) by observing neck length, clavicle prominence, and shoulder line.
- **Personal Color (Visual Estimation):** Analyze skin undertone (Pink/Ochre), eye color, and contrast. Deduce Season (Spring/Summer/Autumn/Winter).

## 2. DIAGNOSIS GENERATION
Based on the analysis, fill the \`result\` object.
- Be specific. Instead of just "Round", say "Round with slight sharpness at the chin".
- **Hair Condition:** Analyze the gloss, frizz, and movement of the hair in the image. Estimate the \`currentLevel\` (brightness) meticulously (e.g., "Tone 7").

## 3. PROPOSAL GENERATION
Based on the diagnosis, propose the BEST hair/fashion style.
- **Hairstyles:** Propose styles that correct bone structure quirks (e.g., "Add volume on top to lengthen a round face").
- **Hair Colors:** Select colors that complement the Personal Color. **Crucial:** Provide a specific \`recommendedLevel\` (e.g., "Tone 9") that blends well with their skin.
- **Fashion/Makeup:** Suggest items that enhance their skeletal and color type.

## 4. OUTPUT REQUIREMENT
Return the result strictly in the defined JSON schema.
**Crucial:** 
1. The \`currentLevel\` and \`recommendedLevel\` fields MUST be formatted strictly like "Tone 7" or "Tone 11".
2. **NO HTML ENTITIES:** Do not use encoded characters like &#x2F;. Use plain text slashes (/) and ampersands (&).
`;
}

module.exports = {
  AI_RESPONSE_SCHEMA,
  getDiagnosisSystemPrompt,
};