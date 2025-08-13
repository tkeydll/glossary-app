// 設定ファイル - Cosmos 用語集システム

/**
 * 環境変数または設定値を取得する関数
 * @param {string} key - 環境変数のキー
 * @param {string} defaultValue - デフォルト値
 * @returns {string} 設定値
 */
function getEnvConfig(key, defaultValue = '') {
    // Node.js環境の場合
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] || defaultValue;
    }
    
    // ブラウザ環境の場合はwindowオブジェクトから取得
    if (typeof window !== 'undefined' && window.ENV_CONFIG) {
        return window.ENV_CONFIG[key] || defaultValue;
    }
    
    // フォールバック: デフォルト値を返す
    return defaultValue;
}

// AI API設定（環境変数対応）
const AI_API_CONFIG = {
    // プロキシサーバー経由のAPIエンドポイント（開発環境用）
    proxyApiUrl: getEnvConfig('AI_PROXY_API_URL', 'http://localhost:3002/api/ai-request'),
    
    // 直接アクセス用のAPIエンドポイント
    // 直接アクセス用のAPIエンドポイント (キーは含めない: 環境変数 AI_FUNCTION_KEY を使ってサーバー側で付与する想定)
    directApiUrl: getEnvConfig('AI_DIRECT_API_URL', 'https://func-dix-platform-dev-japaneast-003.azurewebsites.net/api/GaiAoaiProxy'),
    
    // APIキー（必要に応じて）
    apiKey: getEnvConfig('AI_API_KEY', ''), // クライアント側では空推奨（漏洩防止）
    
    // デフォルト設定
    defaultTemperature: parseFloat(getEnvConfig('AI_DEFAULT_TEMPERATURE', '0.9')),
    defaultTopP: parseFloat(getEnvConfig('AI_DEFAULT_TOP_P', '0.9')),
    defaultFrequencyPenalty: parseFloat(getEnvConfig('AI_DEFAULT_FREQUENCY_PENALTY', '0')),
    defaultPresencePenalty: parseFloat(getEnvConfig('AI_DEFAULT_PRESENCE_PENALTY', '0')),
    
    // プロキシ使用設定
    useProxy: getEnvConfig('AI_USE_PROXY', 'true') === 'true',
    
    // AI解説機能の有効化
    enableAIExplanation: getEnvConfig('AI_ENABLE_EXPLANATION', 'true') === 'true',
    
    // フォールバック設定
    fallbackEnabled: getEnvConfig('AI_FALLBACK_ENABLED', 'true') === 'true',
    retryCount: parseInt(getEnvConfig('AI_RETRY_COUNT', '3')),
    retryDelay: parseInt(getEnvConfig('AI_RETRY_DELAY', '1000'))
};

// Ollama AI 設定（環境変数対応）
const OLLAMA_CONFIG = {
    baseURL: getEnvConfig('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: getEnvConfig('OLLAMA_MODEL', 'llama2'),
    enabled: getEnvConfig('OLLAMA_ENABLED', 'true') === 'true',
    timeout: parseInt(getEnvConfig('OLLAMA_TIMEOUT', '30000'))
};

// API サーバー設定（環境変数対応）
const API_CONFIG = {
    cosmos: {
    // Cosmos API サーバーはデフォルトで 3001 なのでそれに合わせる
    baseURL: getEnvConfig('API_BASE_URL', 'http://localhost:3001/api'),
        enabled: getEnvConfig('API_ENABLED', 'true') === 'true'
    }
};

// UI 設定
const UI_CONFIG = {
    theme: 'light',
    notifications: true,
    autoSave: true,
    debugMode: false
};

// システム設定
const SYSTEM_CONFIG = {
    appName: 'Cosmos用語集システム',
    version: '3.0-cosmos',
    author: 'GitHub Copilot'
};

// グローバルに公開
window.AI_API_CONFIG = AI_API_CONFIG;
window.OLLAMA_CONFIG = OLLAMA_CONFIG;
window.API_CONFIG = API_CONFIG;
window.UI_CONFIG = UI_CONFIG;
window.SYSTEM_CONFIG = SYSTEM_CONFIG;

// 設定の検証とログ出力
function validateConfig() {
    console.log('🔧 AI API設定情報:');
    console.log(`  プロキシAPI URL: ${AI_API_CONFIG.proxyApiUrl}`);
    console.log(`  直接API URL: ${AI_API_CONFIG.directApiUrl ? '設定済み' : '未設定'}`);
    console.log(`  プロキシ使用: ${AI_API_CONFIG.useProxy ? '有効' : '無効'}`);
    console.log(`  AI解説機能: ${AI_API_CONFIG.enableAIExplanation ? '有効' : '無効'}`);
    
    // 必須設定のチェック
    if (!AI_API_CONFIG.proxyApiUrl && !AI_API_CONFIG.directApiUrl) {
        console.warn('⚠️  警告: AI API URLが設定されていません');
    }
}

// 設定の初期化
validateConfig();
