# 用語集システム

Azure Cosmos DB (NoSQL) ベースの用語集管理システムです。以前は SQLite を利用していましたが、データベースは Cosmos DB に移行しました。

## 🚀 機能

- 用語の登録・編集・削除
- AI自動解説生成
- 検索機能
- カテゴリ分類
- Azure Cosmos DB 連携

## 📋 必要な環境

- Node.js (v14以上)
- Azure Cosmos DB アカウント
- ブラウザ（Chrome、Firefox、Safari、Edge）

## 🔧 環境変数設定

このアプリケーションは環境変数を使用してAI APIの設定を行います。

### 方法1: env.js ファイルを使用（推奨）

1. `env.js.example` を `env.js` にコピー
2. 実際の設定値に更新
3. HTMLファイルで読み込み

```html
<script src="env.js"></script>
<script src="config.js"></script>
```

### 方法2: HTMLファイルで直接設定

```html
<script>
window.ENV_CONFIG = {
    AI_PROXY_API_URL: '/api/ai-request',
    AI_DIRECT_API_URL: 'https://your-api-endpoint.com/api/ai',
    AI_API_KEY: 'your-api-key-here',
    API_BASE_URL: '/api',
    AI_USE_PROXY: 'true',
    AI_ENABLE_EXPLANATION: 'true'
};
</script>
<script src="config.js"></script>
```

### 方法3: Node.js環境での設定

```bash
# .envファイルを作成
AI_PROXY_API_URL=/api/ai-request
AI_DIRECT_API_URL=https://your-api-endpoint.com/api/ai
AI_API_KEY=your-api-key-here
API_BASE_URL=/api
AI_USE_PROXY=true
AI_ENABLE_EXPLANATION=true
```

## 🌟 環境変数一覧

| 環境変数 | 説明 | デフォルト値 |
|---------|------|-------------|
| `AI_PROXY_API_URL` | プロキシサーバー経由のAPIエンドポイント | `/api/ai-request` |
| `AI_DIRECT_API_URL` | 直接アクセス用のAPIエンドポイント | 設定済み |
| `AI_API_KEY` | APIキー（必要に応じて） | 空文字 |
| `API_BASE_URL` | API サーバーのベースURL | `/api` |
| `OLLAMA_BASE_URL` | Ollama サーバーのベースURL | `http://localhost:11434` |
| `AI_DEFAULT_TEMPERATURE` | AI生成時の温度設定 | `0.9` |
| `AI_DEFAULT_TOP_P` | AI生成時のTop-P設定 | `0.9` |
| `AI_DEFAULT_FREQUENCY_PENALTY` | 頻度ペナルティ | `0` |
| `AI_DEFAULT_PRESENCE_PENALTY` | 存在ペナルティ | `0` |
| `AI_USE_PROXY` | プロキシ使用設定 | `true` |
| `AI_ENABLE_EXPLANATION` | AI解説機能の有効化 | `true` |
| `AI_FALLBACK_ENABLED` | フォールバック機能の有効化 | `true` |
| `AI_RETRY_COUNT` | リトライ回数 | `3` |
| `AI_RETRY_DELAY` | リトライ間隔（ミリ秒） | `1000` |

## 🔥 セットアップ手順

1. **リポジトリのクローン**
   ```bash
   git clone <repository-url>
   cd glossary
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   ```

3. **環境変数の設定**
   ```bash
   cp env.js.example env.js
   # env.js を編集して実際の設定値に更新
   ```

4. **環境変数 (.env) を設定**
   ルートに `.env` を作成（例）:
   ```env
   COSMOS_ENDPOINT=https://<your-account>.documents.azure.com:443/
   COSMOS_KEY=YOUR_PRIMARY_KEY
   COSMOS_DB_NAME=glossary
   COSMOS_CONTAINER_NAME=terms
   COSMOS_THROUGHPUT=400
   PORT=3001
   ```

5. **開発サーバー一括起動 (API + プロキシ + フロント)**
   これだけで 3 つのプロセス (3001, 3002, 8080) を同時に起動します。
   ```bash
   npm run dev:full
   ```
   - API: http://localhost:3001/api/health
   - プロキシ: http://localhost:3002/health
   - フロント: http://localhost:8080
   Cosmos 資格情報未設定の場合は API が自動的にメモリモード（永続化なし）で起動します。

6. **個別起動したい場合（任意）**
   ```bash
   # API だけ
   npm run api
   # プロキシだけ
   npm run proxy
   # フロントだけ (静的配信)
   npm run dev
   ```

7. **API 動作確認**
   ```bash
   curl http://localhost:3001/api/health
   ```
   `{"cosmos":true}` で Cosmos 接続成功。`cosmos:false` の場合は資格情報またはネットワークを確認。
### Cosmos DB 接続モード

| モード | 条件 | 説明 |
|--------|------|------|
| cosmos | `COSMOS_ENDPOINT` と `COSMOS_KEY` が有効で接続成功 | 実データは Azure Cosmos DB に保存 |
| memory | 資格情報未設定 or 接続失敗 | プロセスメモリ内のみ（再起動で消える / テスト用途） |

本番利用では必ず Cosmos モードで起動してください。

## 📁 ファイル構造

```
glossary/
├── config.js              # 設定ファイル（環境変数対応）
├── env.js                 # ブラウザ読み込み用環境設定 (git管理外推奨)
├── script-cosmos.js       # フロントエンドスクリプト (Cosmos API 対応)
├── cosmos-api-server.js   # Cosmos DB バックエンド API サーバー (3001)
├── proxy-server.js        # AI プロキシサーバー (3002)
├── index.html             # メインHTML
├── styles.css             # スタイルシート
├── test-data.json         # サンプルデータ
├── tests/                 # E2E テスト (Playwright)
└── README.md              # このファイル
```

## 🛠️ 開発者向け情報

### AI API設定

現在は localStorage によるユーザーごとの永続化を廃止し、
環境変数 (`ENV_CONFIG` や `process.env`) とコード内デフォルトのみを使用します。

### 設定の変更方法

- **実行時変更**: ブラウザの設定UIから変更（リロードでリセットされる）
- **デプロイ時変更**: 環境変数を更新
- **開発時変更**: `env.js` ファイルを編集

## 🔒 セキュリティ注意事項

- `env.js` ファイルは `.gitignore` に追加してください
- 本番環境では実際のAPIキーを使用してください
- API URLは信頼できるエンドポイントのみを使用してください

## 🐛 トラブルシューティング

### AI機能が動作しない場合

1. 環境変数が正しく設定されているか確認
2. APIエンドポイントが有効か確認
3. ブラウザのコンソールでエラーメッセージを確認

### データベース接続エラー

1. `.env` の `COSMOS_ENDPOINT` / `COSMOS_KEY` が正しいか確認
2. ファイアウォール / ネットワーク (VNet / IP 制限) を確認
3. Throughput (RU) が極端に不足していないか確認
4. 一時的なリージョン障害の場合は再試行

## 📞 サポート

問題が発生した場合は、以下の情報を含めて報告してください：

- エラーメッセージ
- ブラウザのコンソールログ
- 環境変数の設定（機密情報を除く）
- 使用しているブラウザとバージョン

---

© 2025 用語集システム. Created with ❤️ by GitHub Copilot

## Docker での実行

シンプルに全部入り（静的 + API + プロキシ）で単一コンテナ稼働できます。

### ビルド & 起動
```bash
# ビルド
docker build -t glossary-app .
# 起動 (前面)
docker run --rm -p 8080:8080 -p 3001:3001 -p 3002:3002 \
  -e COSMOS_ENDPOINT="" \
  -e COSMOS_KEY="" \
  glossary-app
```

### docker compose 利用
```bash
docker compose up -d --build
# 停止
docker compose down
```

### ポート
- 8080: ゲートウェイ (静的 + /api + /api/ai-request 逆プロキシ)
- 3001: (内部) 用語集 API (Cosmos / メモリ)
- 3002: (内部) AI プロキシサーバ

Azure Container Apps では外部公開は 8080 のみを使用し、他ポートは同一コンテナ内で内部利用します。

### Cosmos DB を使う場合の環境変数
| 変数 | 説明 |
|------|------|
| COSMOS_ENDPOINT | Cosmos DB アカウントのエンドポイント URL |
| COSMOS_KEY | プライマリキー |
| COSMOS_DB_NAME | DB 名 (既定 glossary) |
| COSMOS_CONTAINER_NAME | コンテナ名 (既定 terms) |

未設定なら自動的にメモリモードで動作します。

### AI プロキシ関連
| 変数 | 説明 |
|------|------|
| AI_API_BASE_URL | 転送先 Azure Function 等のベース URL |
| AI_API_KEY | GaiAoaiProxy の code 値等 |

### ローカル確認
http://localhost:8080 を開き、新規用語を追加して 200 /api/terms が返るか確認。

### 開発向け: ホットリロード無し
コンテナ内で手軽に再起動するには:
```bash
docker compose restart glossary
```

改造して nodemon を入れたい場合は dev 用 Dockerfile を別途作成して下さい。

## 🌐 Azure OpenAI + Function App (用語解説 API)

本リポジトリには Azure Functions (Node.js) で Azure OpenAI を呼び出す `explainTerm` エンドポイントを追加できます。

### デプロイ (インフラ)

1. Bicep パラメータ準備 (例):
```bash
az deployment group create \
   -g <resourceGroup> \
   -f infra/main.bicep \
   -p namePrefix=glossa123 containerImage=<image>:<tag> cosmosPrimaryKey=<key> \
       deployOpenAI=true openAiApiKey=<aoai-key(optional)> \
       aiApiBaseUrl="" aiUseProxy=false
```
2. OpenAI モデルデプロイ (現状 CLI 別ステップ):
```bash
az cognitiveservices account deployment create \
   -g <resourceGroup> \
   -n <openAiAccountName> \
   --deployment-name glossary-model \
   --model-format OpenAI \
   --model-name gpt-4o-mini \
   --model-version 2024-07-18 \
   --sku Standard \
   --capacity 1
```

### Function コード配置 & 発行
`functions/` ディレクトリで:
```bash
cd functions
npm install
func azure functionapp publish <functionAppName>
```

### API 呼び出し
POST https://<functionAppHost>/api/explainTerm
```json
{
   "term": "データレイク",
   "context": "クラウド分析基盤",
   "language": "ja"
}
```
レスポンス例:
```json
{
   "term": "データレイク",
   "explanation": "...markdown...",
   "model": "gpt-4o-mini",
   "usage": { "promptTokens": 120, "completionTokens": 250 }
}
```

### 環境変数 (Function App)
| 名前 | 説明 |
|------|------|
| OPENAI_ENDPOINT | Azure OpenAI エンドポイント (https://xxx.openai.azure.com/) |
| OPENAI_DEPLOYMENT | デプロイメント名 (glossary-model) |
| OPENAI_API_KEY | API キー (Managed Identity へ移行予定) |
| OPENAI_MODEL | モデル名 (gpt-4o-mini 等) |
| OPENAI_MODEL_VERSION | モデルバージョン |

将来的に Key Vault + Managed Identity へ移行しキーを除去することを推奨。

