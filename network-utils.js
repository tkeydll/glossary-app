/**
 * サーバーIP自動検出用のネットワークユーティリティ
 */

// IP アドレスを取得する関数
function getServerIP() {
    try {
        // Node.js環境の場合
        if (typeof require !== 'undefined') {
            const os = require('os');
            const networkInterfaces = os.networkInterfaces();
            
            // 優先順位: イーサネット > Wi-Fi > その他
            const priorityInterfaces = ['イーサネット', 'Ethernet', 'Wi-Fi', 'wlan0', 'eth0'];
            
            for (const interfaceName of priorityInterfaces) {
                const interfaces = networkInterfaces[interfaceName];
                if (interfaces) {
                    for (const iface of interfaces) {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            return iface.address;
                        }
                    }
                }
            }
            
            // フォールバック: 最初に見つかったプライベートIPを使用
            for (const interfaceName in networkInterfaces) {
                const interfaces = networkInterfaces[interfaceName];
                for (const iface of interfaces) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        return iface.address;
                    }
                }
            }
        }
        
        // ブラウザ環境では localhost を返す
        return 'localhost';
    } catch (error) {
        console.error('IP取得エラー:', error);
        return 'localhost';
    }
}

// サーバーの設定を生成する関数
function generateServerConfig(serverIP = null) {
    const ip = serverIP || getServerIP();
    
    return {
        localhost: {
            api: 'http://localhost:3001/api',
            proxy: 'http://localhost:3002/api/ai-request',
            frontend: 'http://localhost:8080'
        },
        network: {
            api: `http://${ip}:3001/api`,
            proxy: `http://${ip}:3002/api/ai-request`,
            frontend: `http://${ip}:8080`
        },
        current: ip
    };
}

// 動的設定の生成
function createDynamicConfig(useNetwork = false) {
    const config = generateServerConfig();
    const baseConfig = useNetwork ? config.network : config.localhost;
    
    return {
        ...baseConfig,
        serverIP: config.current,
        mode: useNetwork ? 'network' : 'localhost'
    };
}

// Node.js環境でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getServerIP,
        generateServerConfig,
        createDynamicConfig
    };
}

// ブラウザ環境でのグローバル設定
if (typeof window !== 'undefined') {
    window.NetworkUtils = {
        getServerIP,
        generateServerConfig,
        createDynamicConfig
    };
}
