/**
 * src/prompts/diagnosisPrompts.js
 *
 * 診断 (フェーズ4) と提案 (フェーズ5) のためのAIプロンプトとスキーマを定義する
 */

// --- ★ AIレスポンスのJSONスキーマ定義 (JHCAレベルスケール対応) ★ ---
const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    "result": {
      "type": "OBJECT",
      "properties": {
        "face": {
          "type": "OBJECT",
          "properties": {
            "nose": {"type": "STRING", "description": "鼻の特徴 (例: 高い, 丸い)"},
            "mouth": {"type": "STRING", "description": "口の特徴 (例: 大きい, 薄い)"},
            "eyes": {"type": "STRING", "description": "目の特徴 (例: 二重, つり目)"},
            "eyebrows": {"type": "STRING", "description": "眉の特徴 (例: アーチ型, 平行)"},
            "forehead": {"type": "STRING", "description": "おでこの特徴 (例: 広い, 狭い)"},
          },
          "required": ["nose", "mouth", "eyes", "eyebrows", "forehead"],
        },
        "skeleton": {
          "type": "OBJECT",
          "properties": {
            "neckLength": {"type": "STRING", "description": "首の長さ (例: 長い, 短い, 標準)"},
            "faceShape": {"type": "STRING", "description": "顔の形 (例: 丸顔, 面長, ベース顔, 卵型)"},
            "bodyLine": {"type": "STRING", "description": "ボディライン (例: ストレート, ウェーブ, ナチュラル)"},
            "shoulderLine": {"type": "STRING", "description": "肩のライン (例: なで肩, いかり肩, 標準)"},
            "faceStereoscopy": {"type": "STRING", "description": "顔の立体感 (例: 立体的, 平面的, 標準)"},
            "bodyTypeFeature": {"type": "STRING", "description": "体型の特徴 (例: 上重心(ストレートタイプ), 下重心(ウェーブタイプ), 骨感が目立つ(ナチュラルタイプ))"},
          },
          "required": ["neckLength", "faceShape", "bodyLine", "shoulderLine", "faceStereoscopy", "bodyTypeFeature"],
        },
        "personalColor": {
          "type": "OBJECT",
          "properties": {
            "baseColor": {"type": "STRING", "description": "ベースカラー (例: イエローベース, ブルーベース)"},
            "season": {"type": "STRING", "description": "シーズン (例: スプリング, サマー, オータム, ウィンター)"},
            "brightness": {"type": "STRING", "description": "明度 (例: 高明度, 中明度, 低明度)"},
            "saturation": {"type": "STRING", "description": "彩度 (例: 高彩度, 中彩度, 低彩度)"},
            "eyeColor": {"type": "STRING", "description": "瞳の色 (例: 明るい茶色, 黒に近い焦げ茶)"},
          },
          "required": ["baseColor", "season", "brightness", "saturation", "eyeColor"],
        },
        "hairCondition": {
          "type": "OBJECT",
          "description": "写真（と将来の動画）から分析した現在の髪の状態",
          "properties": {
            "quality": {"type": "STRING", "description": "髪質 (例: 硬い, 柔らかい, 普通)"},
            "curlType": {"type": "STRING", "description": "クセ (例: 直毛, 波状毛, 捻転毛)"},
            "damageLevel": {"type": "STRING", "description": "ダメージレベル (例: 低(健康), 中(やや乾燥), 高(要ケア))"},
            "volume": {"type": "STRING", "description": "毛量 (例: 多い, 普通, 少ない)"},
            "currentLevel": {"type": "STRING", "description": "詳細なトーンレベルに基づく現在の明るさ (例: トーン7(ミディアムブラウン))"},
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
                "name": {"type": "STRING", "description": "ヘアスタイルの名前 (例: くびれレイヤーミディ)"},
                "description": {"type": "STRING", "description": "スタイルの説明 (50-100文字程度)"},
              },
              "required": ["name", "description"],
            },
            "style2": {
              "type": "OBJECT",
              "properties": {
                "name": {"type": "STRING", "description": "ヘアスタイルのの名前 (例: シースルーバングショート)"},
                "description": {"type": "STRING", "description": "スタイルの説明 (50-100文字程度)"},
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
                "name": {"type": "STRING", "description": "ヘアカラーの名前 (例: ラベンダーアッシュ)"},
                "description": {"type": "STRING", "description": "カラーの説明 (トレンドやブリーチ要否を含める)"},
                "recommendedLevel": {"type": "STRING", "description": "詳細なトーンレベルに基づく推奨明るさ (例: トーン11(ライトブラウン～ゴールド))"},
              },
              "required": ["name", "description", "recommendedLevel"],
            },
            "color2": {
              "type": "OBJECT",
              "properties": {
                "name": {"type": "STRING", "description": "ヘアカラーの名前 (例: ピンクベージュ)"},
                "description": {"type": "STRING", "description": "カラーの説明 (トレンドやブリーチ要否を含める)"},
                "recommendedLevel": {"type": "STRING", "description": "詳細なトーンレベルに基づく推奨明るさ (例: トーン13(ブライトゴールド))"},
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
            "c1": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #FFB6C1"}}, "required": ["name", "hex"]},
            "c2": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #FFDAB9"}}, "required": ["name", "hex"]},
            "c3": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #E6E6FA"}}, "required": ["name", "hex"]},
            "c4": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #98FB98"}}, "required": ["name", "hex"]},
          },
          "required": ["c1", "c2", "c3", "c4"],
        },
        "makeup": {
          "type": "OBJECT",
          "description": "パーソナルカラーに基づいた似合うメイク提案",
          "properties": {
            "eyeshadow": {"type": "STRING", "description": "アイシャドウの色 (例: ゴールド系ブラウン)"},
            "cheek": {"type": "STRING", "description": "チークの色 (例: ピーチピンク)"},
            "lip": {"type": "STRING", "description": "リップの色 (例: コーラルレッド)"},
          },
          "required": ["eyeshadow", "cheek", "lip"],
        },
        "fashion": {
          "type": "OBJECT",
          "description": "骨格診断に基づいた似合うファッション提案",
          "properties": {
            "recommendedStyles": {
              "type": "ARRAY",
              "items": {"type": "STRING"},
              "description": "似合うファッションスタイル (2つ程度。例: Aライン, Iライン)",
            },
            "recommendedItems": {
              "type": "ARRAY",
              "items": {"type": "STRING"},
              "description": "似合うファッションアイテム (2つ程度。例: Vネックニット, テーパードパンツ)",
            },
          },
          "required": ["recommendedStyles", "recommendedItems"],
        },
        "comment": {"type": "STRING", "description": "AIトップヘアスタイリストによる総評 (200-300文字程度)"},
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
## 【最重要】 顧客の要望
以下の顧客の要望を、診断と提案（特に hairstyles, haircolors, comment）に**必ず**反映させてください。
「${userRequestsText}」
`
    : "";

  return `
あなたは日本の高名なトップヘアスタイリストAIです。
顧客から提供された**5つの素材（正面写真、サイド写真、バック写真、正面動画、バック動画）**と性別（${gender}）に基づき、以下のタスクを実行してください。
${requestPromptPart}

## A. 重要な定義（厳守）

### A-1. 詳細なトーンレベルスケール (明るさの基準)
髪の明るさ（明度）の診断と提案は、必ず以下の詳細なトーンレベル指標に基づいて行ってください。

* **トーン 1**: 青みがかった黒（ブルーブラック）。一般的な黒染めよりもさらに暗く、人工的な黒に近いレベルです。
* **トーン 3**: 日本人の自然な黒髪（地毛）。多くの日本人の地毛に近い暗さです。
* **トーン 5**: 自然な黒髪～暗めの栗色（ダークブラウン）。地毛、または「少し暗めの茶色」と認識されるレベルです。室内では黒髪に見えることも多いです。
* **トーン 7**: やや暗めの茶色（ミディアムブラウン）。室内でも「染めている」とわかる程度の自然な明るさです。
* **トーン 9**: 茶色～明るめの茶色（ライトブラウン）。はっきりと明るいと認識されるレベルです。髪にオレンジ味が出やすい頃合いでもあります。
* **トーン 11**: 明るい茶色～金髪に近い茶色（ライトブラウン～ゴールド）。かなり明るく、オレンジ味に加えて黄色味も強く出てくるレベルです。
* **トーン 13**: 明るい金髪（ブライトゴールド）。ブリーチ（脱色）なしで、カラー剤のみで出せる限界に近い明るさです。
* **トーン 15**: 非常に明るい金髪（ペールイエロー）。ブリーチが必須となるレベルです。髪の赤みやオレンジ味はほぼなく、黄色が主体となります。
* **トーン 18**: 白に近い金髪（ホワイトブリーチ、プラチナブロンド）。ブリーチを複数回繰り返して、髪の色素を限界まで抜いた状態です。（19～20はほぼ白色に近いレベルを指します）

### A-2. ヘアカラー提案のガイドライン
ヘアカラーを提案する際は、以下のガイドラインを厳守すること。
1.  **トレンドの参照:** 提案するヘアカラーの色名は、必ず日本のトレンドスタイル（参考サイト1, 2）を最優先で参照し、顧客に最も似合う一般的な色名（例：ミルクティーベージュ、ラベンダーアッシュ等）を選ぶこと。
2.  **パーソナルカラー:** 診断したパーソナルカラー（例：ブルベ夏）に最適な色味を提案すること。
3.  **現実的な施術:** 顧客の「現在の髪の状態（currentLevel, damageLevel）」を基に、ブリーチが必須かどうか、またはブリーチなしでも可能な範囲かを判断し、\`description\` に必ず明記すること。

* 参考サイト1 (トレンド): https://beauty.hotpepper.jp/catalog/
* 参考サイト2 (トレンド): https://www.ozmall.co.jp/hairsalon/catalog/

---

## B. 実行タスク

1.  **診断 (result)**:
    * **顔 (face)**: 主に正面写真と正面動画から特徴を分析してください。
    * **骨格 (skeleton)**:
        * \`neckLength\`, \`faceShape\`, \`shoulderLine\`: 正面・サイド写真から分析してください。
        * **\`faceStereoscopy\` (顔の立体感)**: 正面動画（顔の振り）とサイド写真を比較して「立体的」「平面的」などを判断してください。
        * **\`bodyTypeFeature\` (体型の特徴)**: 写真全体から「上重心」「下重心」「骨感が目立つ」などを判断してください。
    * **パーソナルカラー (personalColor)**: 主に正面写真と正面動画から分析してください。
    * **【重要】現在の髪の状態 (hairCondition)**:
        * **\`quality\` (髪質)**, **\`curlType\` (クセ)**, **\`damageLevel\` (ダメージ)**, **\`volume\` (毛量)**:
        * **3枚の写真と2本の動画すべて**を詳細に分析してください。特に動画は、髪が動いたときの「しなり方（髪質）」「内側のうねり（クセ）」「ツヤの動き（ダメージ）」「膨らみ方（毛量）」を判断する上で最も重要です。
        * **【追加】 \`currentLevel\` (現在の明るさ)**: バック写真や動画を基に、**A-1. 詳細なトーンレベルスケール** に基づいて現在の髪の明るさを「トーン7(ミディアムブラウン)」のように厳密に診断してください。

2.  **提案 (proposal)**: 診断結果に基づき、以下の提案をしてください。
    * **hairstyles**: 顧客の骨格だけでなく、**現在の髪質やクセ（例：波状毛）でも再現可能か**という観点で、最適なスタイルを2つ提案してください。
    * **haircolors**:
        * **A-2. ヘアカラー提案のガイドライン** に厳密に従い、顧客（パーソナルカラー、現在の髪の状態）に最適で、かつ参考サイトのトレンドに合った色名を2つ提案すること。
        * \`name\`には「ミルクティーベージュ」「ラベンダーアッシュ」のような、参考サイトに基づいた一般的なトレンドのカラー名を入れること。
        * \`description\`には、**ブリーチの要否**や施術上の注意点（例：「現在の髪（診断したレベル）からはブリーチ必須です」など）を必ず含めること。
        * \`recommendedLevel\`には、**A-1. 詳細なトーンレベルスケール** に基づく推奨明るさレベルを必ず含めること。
    * **bestColors**: パーソナルカラーに基づき、HEXコード付きで4色提案してください。
    * **makeup**: パーソナルカラーに基づき、提案してください。
    * **fashion**: 診断結果の \`skeleton.bodyTypeFeature\`（骨格タイプ）に基づき、似合うファッションスタイルを2つ、具体的なアイテムを2つ提案してください。
    * **comment (総評)**: 全体を総括し、特に**現在の髪の状態（例：ダメージレベル高）**に基づいた具体的なケアアドバイス（例：サロンでの髪質改善トリートメント推奨）を必ず含めてください。
    * **重要:** ヘアスタイルの提案は、以下の参考サイトにあるような、日本の現代のトレンドスタイルを強く意識してください。
    * 参考サイト1: https://beauty.hotpepper.jp/catalog/
    * 参考サイト2: https://www.ozmall.co.jp/hairsalon/catalog/

回答は必ず指定されたJSONスキーマに従い、JSONオブジェクトのみを返してください。前置きやマークダウン（'''json ... '''）は一切含めないでください。
`;
}

module.exports = {
  AI_RESPONSE_SCHEMA,
  getDiagnosisSystemPrompt,
};