// ネットワーク環境用設定ファイル
// 他のPCからアクセスする場合はこのファイルを使用

// IPアドレスを自動検出する関数
function detectServerIP() {
    // 開発時のためのデフォルト値
    // 実際のIPアドレスは起動時に自動検出されます
    const defaultIP = 'localhost';
    
    // URLパラメータからIPを取得
    const urlParams = new URLSearchParams(window.location.search);
    const serverIP = urlParams.get('serverIP');
    
    if (serverIP) {
        console.log('🌐 URLパラメータからサーバーIP取得:', serverIP);
        return serverIP;
    }
    
    // 現在のホストからIPを推測
    const currentHost = window.location.hostname;
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        console.log('🌐 現在のホストからサーバーIP推測:', currentHost);
        return currentHost;
    }
    
    console.log('🏠 デフォルトIP使用:', defaultIP);
    return defaultIP;
}

// 検出されたIPアドレス
const SERVER_IP = detectServerIP();

// 環境設定
window.ENV_CONFIG = {
    // 統合ゲートウェイ経由 (同一オリジン) Container Apps / ローカル両対応
    API_BASE_URL: '/api',
    API_ENABLED: 'true',
    
    // AI API設定 (ゲートウェイが /api/ai-request を内部 3002 へ転送)
    AI_PROXY_API_URL: '/api/ai-request',
    AI_DIRECT_API_URL: 'https://func-dix-platform-dev-japaneast-003.azurewebsites.net/api/GaiAoaiProxy',
    AI_USE_PROXY: 'true',
    AI_ENABLE_EXPLANATION: 'true',
    AI_FALLBACK_ENABLED: 'true',
    AI_RETRY_COUNT: '3',
    AI_RETRY_DELAY: '1000',
    AI_DEFAULT_TEMPERATURE: '0.9',
    AI_DEFAULT_TOP_P: '0.9',
    AI_DEFAULT_FREQUENCY_PENALTY: '0',
    AI_DEFAULT_PRESENCE_PENALTY: '0',
    
    // Ollama設定
    OLLAMA_BASE_URL: `http://${SERVER_IP}:11434`,
    OLLAMA_MODEL: 'llama2',
    OLLAMA_ENABLED: 'true',
    OLLAMA_TIMEOUT: '30000',
    
    // フォールバック設定
    
    // デバッグ情報
    _DEBUG_SERVER_IP: SERVER_IP,
    _DEBUG_CURRENT_HOST: window.location.hostname,
    _DEBUG_TIMESTAMP: new Date().toISOString()
};

// 設定の検証とログ出力
console.log('🔧 ネットワーク環境設定情報:');
console.log(`  サーバーIP: ${SERVER_IP}`);
console.log(`  API URL (gateway relative): ${window.ENV_CONFIG.API_BASE_URL}`);
console.log(`  プロキシAPI URL (gateway relative): ${window.ENV_CONFIG.AI_PROXY_API_URL}`);
console.log(`  現在のホスト: ${window.location.hostname}`);

// 接続テスト
if (SERVER_IP !== 'localhost') {
    console.log('🌐 他のPCからのアクセスを検出しました');
    console.log('📡 ネットワーク接続をテストしています...');
    
    // APIサーバーへの接続テスト
    fetch(`${window.ENV_CONFIG.API_BASE_URL}/health`)
        .then(response => {
            if (response.ok) {
                console.log('✅ APIサーバーへの接続が正常です');
            } else {
                console.warn('⚠️ APIサーバーへの接続に問題があります');
            }
        })
        .catch(error => {
            console.error('❌ APIサーバーへの接続が失敗しました:', error);
            console.log('💡 ヒント: サーバーが起動していることを確認してください');
        });
} else {
    console.log('🏠 ローカル環境での実行を検出しました');
}
