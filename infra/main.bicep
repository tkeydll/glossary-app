// Infra for glossary app: ACR, Log Analytics, Container Apps Env, Cosmos DB (cost-optimized), Container App
// Focus: minimal cost (single region, no autoscale RU provisioning, Session consistency, no multi-region, free tier attempt)
// NOTE: Free tier can only be applied once per subscription; parameter toggle included.

param location string = resourceGroup().location
@description('Prefix for all resource names. Must be at least 5 chars to satisfy ACR naming.')
@minLength(5)
param namePrefix string = 'glossa'
param enableCosmosFreeTier bool = true // Free Tier: only once per subscription; set false if already consumed elsewhere
param containerImage string
param aiApiBaseUrl string = ''
param aiUseProxy bool = true
param cosmosDbName string = 'glossary'
param cosmosContainerName string = 'terms'
@description('Provisioned throughput (RU/s) for the container when NOT in serverless mode. Kept <= 400 to stay within Free Tier 1000 RU allowance.')
param cosmosContainerThroughput int = 400
@description('If true, creates account in serverless mode (no provisioned RU; pay per request). Leave false to use provisioned RU covered by Free Tier.')
param useServerless bool = false

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
  sharedKey: listKeys(logws.id, '2022-10-01').primarySharedKey
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
@description('Cosmos connection key; supply via secure parameter when deploying (not stored in template).')
@secure()
param cosmosPrimaryKey string

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}app'
  location: location
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'Auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: ''
        }
      ]
      secrets: [
        {
          name: 'cosmos-key'
          value: cosmosPrimaryKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'gateway'
          image: '${acr.properties.loginServer}/${containerImage}'
          resources: {
            cpu: 1
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '3001'
            }
            {
              name: 'PROXY_PORT'
              value: '3002'
            }
            {
              name: 'STATIC_PORT'
              value: '8080'
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmos.properties.documentEndpoint
            }
            {
              name: 'COSMOS_DB_NAME'
              value: cosmosDbName
            }
            {
              name: 'COSMOS_CONTAINER_NAME'
              value: cosmosContainerName
            }
            {
              name: 'COSMOS_KEY'
              secretRef: 'cosmos-key'
            }
            {
              name: 'AI_USE_PROXY'
              value: string(aiUseProxy)
            }
            {
              name: 'AI_API_BASE_URL'
              value: aiApiBaseUrl
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

output containerAppFqdn string = app.properties.configuration.ingress.fqdn
output cosmosEndpoint string = cosmos.properties.documentEndpoint
