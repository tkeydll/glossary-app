// Infra for glossary app: ACR, Log Analytics, Container Apps Env, Cosmos DB (cost-optimized), Container App
// Focus: minimal cost (single region, no autoscale RU provisioning, Session consistency, no multi-region, free tier attempt)
// NOTE: Free tier can only be applied once per subscription; parameter toggle included.

param location string = resourceGroup().location
@description('Prefix for all resource names. Must be at least 5 chars to satisfy ACR naming.')
@minLength(5)
param namePrefix string = 'glossary'
param enableCosmosFreeTier bool = true // Free Tier: only once per subscription; set false if already consumed elsewhere
// containerImage removed (troubleshoot minimal infra)
param cosmosDbName string = 'glossary'
param cosmosContainerName string = 'terms'
@description('Provisioned throughput (RU/s) for the container when NOT in serverless mode. Kept <= 400 to stay within Free Tier 1000 RU allowance.')
param cosmosContainerThroughput int = 400
@description('If true, creates account in serverless mode (no provisioned RU; pay per request). Leave false to use provisioned RU covered by Free Tier.')
param useServerless bool = false

// ---- Azure OpenAI + Function App (Glossary Explanation) additions ----
@description('OpenAI account name (Cognitive Services). Must be globally unique-ish within subscription.')
param openAiAccountName string = '${namePrefix}aoai'
@description('Deployment name for the model.')
param openAiDeploymentName string = 'glossary-model'
@description('Whether to disable local auth (key based) on OpenAI account (keep false until MI ready).')
param openAiDisableLocalAuth bool = false
// (Removed Function & Container App for staged troubleshooting)


// ACR (Basic)
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${namePrefix}acr'
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

// Log Analytics
resource logws 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${namePrefix}law'
  location: location
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// Container Apps Environment
resource cae 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}cae'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
  customerId: logws.properties.customerId
  sharedKey: listKeys(logws.id, '2022-10-01').primarySharedKey // keep listKeys (log analytics doesn't expose keys via ref)
      }
    }
  }
}

// Cosmos DB Account (SQL API) cost optimized
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: '${namePrefix}cosmos'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    enableFreeTier: enableCosmosFreeTier
    publicNetworkAccess: 'Enabled' // can later switch to 'SecuredByPerimeter'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    // Add serverless capability when requested
    capabilities: useServerless ? [
      {
        name: 'EnableServerless'
      }
    ] : []
    disableKeyBasedMetadataWriteAccess: false
    disableLocalAuth: false // can flip to true after Managed Identity adoption
    minimalTlsVersion: 'Tls12'
  }
}

// Database + Container (provisioned via child resources w/ minimal throughput) using autoscale = off, using serverless (no explicit throughput) -> Use minimal cost: rely on per request billing if available
resource sqlDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  name: cosmosDbName
  parent: cosmos
  properties: {
    resource: {
      id: cosmosDbName
    }
    options: {
      autoscaleSettings: null
    }
  }
}

resource sqlContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  name: cosmosContainerName
  parent: sqlDb
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
    }
    options: useServerless ? {} : {
      throughput: cosmosContainerThroughput
    }
  }
}

// Container App pulling from ACR. (Assumes image already pushed.)
// Removed unused params (function/container toggles) during troubleshooting

// (Container App env definitions removed for minimal deployment)

// (Container App & role assignment removed)

// (Container App output removed)
output cosmosEndpoint string = cosmos.properties.documentEndpoint

// ---------------- Azure OpenAI & Function App Section ----------------
// OpenAI account (Cognitive Services) + model deployment conditional
resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiAccountName
  kind: 'OpenAI'
  location: location
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: openAiDisableLocalAuth
  }
}

// NOTE: Model deployments for Azure OpenAI currently require REST/CLI after account creation.
// We expose needed output variables for deployment pipeline step (az cognitiveservices account deployment create ...)

// (Function resources removed for troubleshooting)

// (Function outputs removed)
output openAiEndpoint string = openai.properties.endpoint
output openAiDeployment string = openAiDeploymentName

// ---------------- Key Vault (store Cosmos key) ----------------
@description('Key Vault SKU (standard or premium)')
@allowed([
  'standard'
  'premium'
])
param kvSku string = 'standard'

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}kv'
  location: location
  properties: {
    tenantId: subscription().tenantId
    enableSoftDelete: true
    publicNetworkAccess: 'Enabled'
    sku: {
      name: kvSku
      family: 'A'
    }
    enableRbacAuthorization: true // use RBAC instead of access policies
  }
  tags: {
    component: 'secrets'
  }
}

// Retrieve Cosmos primary key and store as secret (deployment-time action).
// NOTE: listKeys is required because primary key not exposed via symbolic ref; diagnostic suppressed intentionally.
// bicep:disable-next-line no-loc-expr-outside-params
var cosmosPrimaryKey = listKeys(cosmos.id, '2024-11-15').primaryMasterKey

resource cosmosKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'cosmos-key'
  parent: kv
  properties: {
    value: cosmosPrimaryKey
  }
}

output keyVaultName string = kv.name
output keyVaultUri string = kv.properties.vaultUri
output cosmosKeySecretName string = 'cosmos-key'
