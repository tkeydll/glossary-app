const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// より柔軟なCORS設定
app.use(cors({
    origin: function(origin, callback) {
        console.log('🔍 CORS チェック - Origin:', origin);
        
        // 開発環境では基本的に全て許可
        if (process.env.NODE_ENV === 'development' || !origin) {
            console.log('✅ 開発環境またはOriginなし - 許可');
            return callback(null, true);
        }
        
        // 許可するパターン
        const allowedPatterns = [
            /^https?:\/\/localhost/,           // localhost
            /^https?:\/\/127\.0\.0\.1/,       // 127.0.0.1
            /^https?:\/\/10\.\d+\.\d+\.\d+/,  // 10.x.x.x (プライベートネットワーク)
            /^https?:\/\/192\.168\.\d+\.\d+/, // 192.168.x.x (プライベートネットワーク)
            /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+/, // 172.16.x.x-172.31.x.x (プライベートネットワーク)
            /^file:\/\//,                     // ファイルプロトコル
            /^https?:\/\/[^.]+\.local/        // .localドメイン
        ];
        
        // パターンマッチングチェック
        const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
        
        if (isAllowed) {
            console.log('✅ 許可されたOrigin:', origin);
            return callback(null, true);
        }
        
        console.log('❌ 許可されていないOrigin:', origin);
        return callback(new Error('CORS policy violation'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count']
}));

// プリフライトリクエスト対応
app.options('*', cors());

// JSONボディパーサー
app.use(express.json());

// 環境変数からAI APIのURLを取得
const AI_API_BASE_URL = process.env.AI_API_BASE_URL || 'https://func-dix-platform-dev-japaneast-003.azurewebsites.net';
const AI_API_KEY = process.env.AI_API_KEY || '';

// プロキシ設定
const proxyOptions = {
    target: AI_API_BASE_URL,
    changeOrigin: true,
    secure: true,
    followRedirects: true,
    logLevel: 'info',
    pathRewrite: {
        '^/api/proxy': '/api' // /api/proxy/* を /api/* に変更
    },
    onError: (err, req, res) => {
        console.error('❌ プロキシエラー:', err.message);
        res.status(500).json({
            error: 'プロキシエラーが発生しました',
            message: err.message
        });
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log('📤 プロキシリクエスト:', req.method, req.url);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log('📥 プロキシレスポンス:', proxyRes.statusCode, req.url);
    }
};

// プロキシミドルウェアを適用
app.use('/api/proxy', createProxyMiddleware(proxyOptions));

// ヘルスチェック
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'AIプロキシサーバーが正常に動作しています',
        cors: 'プライベートネットワーク対応'
    });
});

// 直接AIリクエスト処理（フォールバック）
app.post('/api/ai-request', async (req, res) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1秒
    
    async function makeAIRequest(retryCount = 0) {
        try {
            console.log('🤖 AI リクエスト受信:', req.body.user_prompt ? req.body.user_prompt.substring(0, 50) + '...' : 'なし');
            if (retryCount > 0) {
                console.log(`🔄 リトライ ${retryCount}/${MAX_RETRIES}`);
            }
            
            const { system_prompt, user_prompt, temperature, top_p, frequency_penalty, presence_penalty } = req.body;
            
                        const url = AI_API_KEY
                            ? `${AI_API_BASE_URL}/api/GaiAoaiProxy?code=${AI_API_KEY}`
                            : `${AI_API_BASE_URL}/api/GaiAoaiProxy`;
                        const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'AIProxyServer/1.0'
                },
                body: JSON.stringify({
                    system_prompt,
                    user_prompt,
                    temperature: temperature || 0.7,
                    top_p: top_p || 0.9,
                    frequency_penalty: frequency_penalty || 0,
                    presence_penalty: presence_penalty || 0
                }),
                timeout: 30000 // 30秒タイムアウト
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Azure Function APIエラー:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                    retryCount
                });
                
                // 503, 502, 500エラーの場合はリトライ
                if ([503, 502, 500].includes(response.status) && retryCount < MAX_RETRIES) {
                    console.log(`⏰ ${RETRY_DELAY}ms後にリトライします...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    return makeAIRequest(retryCount + 1);
                }
                
                return res.status(response.status).json({
                    error: 'Azure Function APIエラー',
                    status: response.status,
                    message: response.statusText,
                    details: errorText,
                    retryCount
                });
            }

            const data = await response.json();
            console.log('✅ AI API成功' + (retryCount > 0 ? ` (${retryCount}回目のリトライで成功)` : ''));
            
            res.json(data);
        } catch (error) {
            console.error('❌ AI リクエストエラー:', error);
            
            // ネットワークエラーの場合もリトライ
            if (retryCount < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.name === 'FetchError')) {
                console.log(`⏰ ${RETRY_DELAY}ms後にリトライします...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return makeAIRequest(retryCount + 1);
            }
            
            res.status(500).json({
                error: 'AI リクエストエラー',
                message: error.message,
                retryCount
            });
        }
    }
    
    await makeAIRequest();
});

const port = process.env.PROXY_PORT || 3002;
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 AIプロキシサーバーがポート ${port} で起動しました`);
    console.log(`📡 プロキシ対象: ${AI_API_BASE_URL}`);
    console.log(`💾 ローカルアクセス: http://localhost:${port}`);
    console.log(`🌐 他PCからのアクセス: http://YOUR_IP:${port}`);
    console.log(`🔒 CORS設定: プライベートネットワーク対応`);
    console.log(`📊 ヘルスチェック: http://localhost:${port}/health`);
    console.log(`🤖 AI リクエスト: http://localhost:${port}/api/ai-request`);
});
