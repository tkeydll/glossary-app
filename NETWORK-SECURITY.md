# ネットワークセキュリティ設定

このドキュメントでは、用語集アプリケーションの新しいネットワークセキュリティ機能について説明します。

## 🔐 セキュリティ要件

**問題**: 全てのリソースを仮想ネットワーク内に閉じる

**要件**:
- あらゆるリソースのパブリックアクセスを遮断する
- リソース間の通信は仮想ネットワークを経由した閉域接続とする
- テストのための例外として、開発用PCからのアクセスのみ許可する

## 🏗️ 実装されたアーキテクチャ

### 仮想ネットワーク構成

```
Virtual Network (10.0.0.0/16)
├── Container Apps Subnet (10.0.1.0/24)
│   ├── Container Apps Environment (内部モード)
│   └── Function App (VNet統合)
└── Private Endpoints Subnet (10.0.2.0/24)
    ├── ACR Private Endpoint
    ├── Cosmos DB Private Endpoint
    ├── OpenAI Private Endpoint
    ├── Key Vault Private Endpoint
    └── Storage Account Private Endpoint
```

### プライベートエンドポイント

全てのAzureサービスに対してプライベートエンドポイントが構成されています：

| サービス | プライベートDNSゾーン | 説明 |
|---------|-------------------|------|
| Container Registry | `privatelink.azurecr.io` | コンテナイメージの取得 |
| Cosmos DB | `privatelink.documents.azure.com` | データベースアクセス |
| OpenAI | `privatelink.openai.azure.com` | AI API呼び出し |
| Key Vault | `privatelink.vaultcore.azure.net` | シークレット管理 |
| Storage Account | `privatelink.blob.core.windows.net` | Function App用ストレージ |

### ネットワークセキュリティグループ

プライベートエンドポイントサブネット用のNSGが構成されており、以下を許可します：
- VNet内の通信 (ポート: すべて)
- HTTPS通信 (ポート: 443)
- 開発PC からのアクセス (設定されている場合)

## 🚀 デプロイメント

### 1. セキュアデプロイメント（推奨）

開発PCのIPアドレスを自動検出してデプロイします：

```bash
./deploy-secure.sh
```

### 2. 手動デプロイメント

パラメータファイルを使用したデプロイ：

```bash
az deployment group create \
    --resource-group "rg-glossary-secure" \
    --template-file infra/main.bicep \
    --parameters @infra/parameters.json
```

### 3. 完全プライベートデプロイメント

開発PCアクセスなしでデプロイ：

```bash
az deployment group create \
    --resource-group "rg-glossary-secure" \
    --template-file infra/main.bicep \
    --parameters allowedDevIpAddresses='[]'
```

## ⚙️ パラメータ設定

### 必須パラメータ

- `namePrefix`: リソース名のプレフィックス (5文字以上)
- `location`: デプロイ先のAzureリージョン

### ネットワークパラメータ

| パラメータ | デフォルト値 | 説明 |
|-----------|-------------|------|
| `allowedDevIpAddresses` | `[]` | 開発PC IPアドレス配列 |
| `vnetAddressSpace` | `10.0.0.0/16` | 仮想ネットワークアドレス空間 |
| `containerAppsSubnetAddressSpace` | `10.0.1.0/24` | Container Appsサブネット |
| `privateEndpointsSubnetAddressSpace` | `10.0.2.0/24` | プライベートエンドポイントサブネット |

### 開発PCアクセス設定例

```json
{
  "allowedDevIpAddresses": {
    "value": [
      "203.0.113.1/32",      // 単一IP
      "198.51.100.0/24"      // IP範囲
    ]
  }
}
```

## 🔍 テスト・検証

### ネットワーク設定テスト

```bash
node test-network-config.js
```

このスクリプトは以下を確認します：
- プライベートDNSゾーンの設定
- ネットワークインターフェースの設定
- CORS設定の確認

### 接続テスト

デプロイ後、以下を確認してください：

1. **プライベートエンドポイント解決**:
   ```bash
   nslookup <service-name>.privatelink.<service-domain>
   ```

2. **VNet内通信**:
   Container Apps環境内からのサービス接続をテスト

3. **開発PCアクセス**:
   設定したIPアドレスからのアクセスをテスト

## 🛡️ セキュリティ機能

### 実装済み

- ✅ **仮想ネットワーク分離**: 全リソースがVNet内に配置
- ✅ **プライベートエンドポイント**: パブリックインターネット経由のアクセスを遮断
- ✅ **プライベートDNS**: VNet内でのサービス名前解決
- ✅ **ネットワークセキュリティグループ**: サブネットレベルでのアクセス制御
- ✅ **条件付きパブリックアクセス**: 開発IP許可リスト機能
- ✅ **VNet統合**: Function AppのVNet統合
- ✅ **内部Container Apps環境**: 外部からのアクセス遮断

### アクセス制御マトリックス

| リソース | パブリックアクセス | VNet内アクセス | 開発PCアクセス |
|---------|-------------------|---------------|----------------|
| ACR | ❌ (無効) | ✅ プライベートエンドポイント | ⚙️ 条件付き |
| Cosmos DB | ❌ (無効) | ✅ プライベートエンドポイント | ⚙️ 条件付き |
| OpenAI | ❌ (無効) | ✅ プライベートエンドポイント | ⚙️ 条件付き |
| Key Vault | ❌ (無効) | ✅ プライベートエンドポイント | ⚙️ 条件付き |
| Storage | ❌ (無効) | ✅ プライベートエンドポイント | ⚙️ 条件付き |
| Container Apps | ❌ (内部モード) | ✅ VNet内のみ | ❌ |
| Function App | ✅ HTTPS | ✅ VNet統合 | ✅ |

## 📋 運用ガイド

### 開発者アクセス管理

1. **新しい開発者の追加**:
   ```bash
   # パラメータファイルを更新
   az deployment group create \
       --resource-group "rg-glossary-secure" \
       --template-file infra/main.bicep \
       --parameters allowedDevIpAddresses='["203.0.113.1/32","203.0.113.2/32"]'
   ```

2. **一時的なアクセス許可**:
   IPアドレスを一時的に追加し、後で削除

3. **完全プライベート環境**:
   本番環境では `allowedDevIpAddresses=[]` に設定

### 監視・トラブルシューティング

1. **DNS解決確認**:
   ```bash
   nslookup <service-name>.privatelink.<domain>
   ```

2. **ネットワーク接続テスト**:
   ```bash
   telnet <private-endpoint-ip> 443
   ```

3. **ログ確認**:
   - Azure Monitor でネットワークフローログを確認
   - Application Insights で接続エラーを監視

## 🔄 マイグレーション

既存の環境から移行する場合：

1. 新しいセキュアな環境をデプロイ
2. データのマイグレーション（必要に応じて）
3. DNS設定の更新
4. 古い環境の削除

## 📚 関連ドキュメント

- [Azure Private Endpoints](https://docs.microsoft.com/azure/private-link/private-endpoint-overview)
- [Azure Container Apps Networking](https://docs.microsoft.com/azure/container-apps/networking)
- [Azure Virtual Network](https://docs.microsoft.com/azure/virtual-network/)
- [Azure Network Security Groups](https://docs.microsoft.com/azure/virtual-network/network-security-groups-overview)