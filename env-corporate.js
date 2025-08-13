// 現在のネットワーク環境に合わせた設定ファイル（IP: 10.212.41.220）
// 実際の環境に合わせて自動生成

// 実際のサーバーIPアドレス
const SERVER_IP = '10.212.41.220';

// 環境設定
window.ENV_CONFIG = {
    // API設定
    API_BASE_URL: `http://${SERVER_IP}:3001/api`,
    API_ENABLED: 'true',
    
    // AI API設定
    AI_PROXY_API_URL: `http://${SERVER_IP}:3002/api/ai-request`,
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
    _DEBUG_TIMESTAMP: new Date().toISOString(),
    _DEBUG_NETWORK_TYPE: 'corporate'
};

// 設定の検証とログ出力
console.log('🔧 企業ネットワーク環境設定情報:');
console.log(`  サーバーIP: ${SERVER_IP}`);
console.log(`  API URL: ${window.ENV_CONFIG.API_BASE_URL}`);
console.log(`  プロキシAPI URL: ${window.ENV_CONFIG.AI_PROXY_API_URL}`);
console.log(`  現在のホスト: ${window.location.hostname}`);
console.log(`  ネットワークタイプ: ${window.ENV_CONFIG._DEBUG_NETWORK_TYPE}`);

// 接続テスト
console.log('🌐 企業ネットワークからのアクセスを検出しました');
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
        console.log('💡 ヒント:');
        console.log('  - サーバーが起動していることを確認してください');
        console.log('  - ファイアウォールでポート 3001, 3002, 8080 が開放されていることを確認してください');
        console.log('  - ネットワーク管理者に相談してください');
    });

// プロキシサーバーへの接続テスト
fetch(`http://${SERVER_IP}:3002/health`)
    .then(response => {
        if (response.ok) {
            console.log('✅ プロキシサーバーへの接続が正常です');
        } else {
            console.warn('⚠️ プロキシサーバーへの接続に問題があります');
        }
    })
    .catch(error => {
        console.error('❌ プロキシサーバーへの接続が失敗しました:', error);
    });
