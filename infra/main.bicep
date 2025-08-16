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

// ---- Optional Function App (HTTP explainTerm) deployment toggle ----
@description('Deploy Azure Function App for explainTerm API')
param deployFunction bool = true

// ---- Azure OpenAI + Function App (Glossary Explanation) additions ----
@description('OpenAI account name (Cognitive Services). Must be globally unique-ish within subscription.')
param openAiAccountName string = '${namePrefix}aoai'
@description('Deployment name for the model.')
param openAiDeploymentName string = 'glossary-model'
@description('Whether to disable local auth (key based) on OpenAI account (keep false until MI ready).')
param openAiDisableLocalAuth bool = false
// (Removed Function & Container App for staged troubleshooting)

// ---- Network Security Parameters ----
@description('IP addresses allowed to access resources (development PCs). Leave empty array to allow all private networks.')
param allowedDevIpAddresses array = []

@description('Virtual network address space')
param vnetAddressSpace string = '10.0.0.0/16'

@description('Subnet for Container Apps')
param containerAppsSubnetAddressSpace string = '10.0.1.0/24'

@description('Subnet for private endpoints')
param privateEndpointsSubnetAddressSpace string = '10.0.2.0/24'

// ---- Virtual Network Infrastructure ----
// Virtual Network
resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: '${namePrefix}vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [vnetAddressSpace]
    }
    subnets: [
      {
        name: 'container-apps-subnet'
        properties: {
          addressPrefix: containerAppsSubnetAddressSpace
          delegations: [
            {
              name: 'Microsoft.App.environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'private-endpoints-subnet'
        properties: {
          addressPrefix: privateEndpointsSubnetAddressSpace
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

// Network Security Group for private endpoints subnet
var devPcSecurityRules = [for (ip, index) in allowedDevIpAddresses: {
  name: 'AllowDevPC${index + 1}'
  properties: {
    protocol: '*'
    sourcePortRange: '*'
    destinationPortRange: '*'
    sourceAddressPrefix: ip
    destinationAddressPrefix: '*'
    access: 'Allow'
    priority: 200 + index
    direction: 'Inbound'
  }
}]

resource privateEndpointsNsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: '${namePrefix}private-endpoints-nsg'
  location: location
  properties: {
    securityRules: concat([
      {
        name: 'AllowVNetInBound'
        properties: {
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: 'VirtualNetwork'
          access: 'Allow'
          priority: 100
          direction: 'Inbound'
        }
      }
      {
        name: 'AllowHttpsInBound'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 110
          direction: 'Inbound'
        }
      }
    ], 
    // Add rules for development PC access if IP addresses are specified
    empty(allowedDevIpAddresses) ? [] : devPcSecurityRules)
  }
}

// Update private endpoints subnet to use NSG
resource privateEndpointsSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' = {
  name: 'private-endpoints-subnet'
  parent: vnet
  properties: {
    addressPrefix: privateEndpointsSubnetAddressSpace
    privateEndpointNetworkPolicies: 'Disabled'
    networkSecurityGroup: {
      id: privateEndpointsNsg.id
    }
  }
}

// ACR (Basic)
var acrIpRules = [for ip in allowedDevIpAddresses: {
  action: 'Allow'
  value: ip
}]

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${namePrefix}acr'
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: empty(allowedDevIpAddresses) ? 'Disabled' : 'Enabled'
    networkRuleSet: empty(allowedDevIpAddresses) ? null : {
      defaultAction: 'Deny'
      ipRules: acrIpRules
    }
  }
}

// Private endpoint for ACR
resource acrPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: '${namePrefix}acr-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointsSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: '${namePrefix}acr-plink'
        properties: {
          privateLinkServiceId: acr.id
          groupIds: ['registry']
        }
      }
    ]
  }
}

// Private DNS zone for ACR
resource acrPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.azurecr.io'
  location: 'global'
}

// Link DNS zone to VNet
resource acrPrivateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  name: '${namePrefix}acr-dns-link'
  parent: acrPrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

// DNS A record for ACR private endpoint
resource acrPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: acrPrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: {
          privateDnsZoneId: acrPrivateDnsZone.id
        }
      }
    ]
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
    vnetConfiguration: {
      infrastructureSubnetId: resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'container-apps-subnet')
      internal: true
    }
  }
}

// Cosmos DB Account (SQL API) cost optimized
var cosmosIpRules = [for ip in allowedDevIpAddresses: {
  ipAddressOrRange: ip
}]

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
    publicNetworkAccess: empty(allowedDevIpAddresses) ? 'Disabled' : 'Enabled'
    ipRules: empty(allowedDevIpAddresses) ? [] : cosmosIpRules
    isVirtualNetworkFilterEnabled: true
    virtualNetworkRules: [
      {
        id: privateEndpointsSubnet.id
        ignoreMissingVNetServiceEndpoint: false
      }
    ]
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

// Private endpoint for Cosmos DB
resource cosmosPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: '${namePrefix}cosmos-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointsSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: '${namePrefix}cosmos-plink'
        properties: {
          privateLinkServiceId: cosmos.id
          groupIds: ['Sql']
        }
      }
    ]
  }
}

// Private DNS zone for Cosmos DB
resource cosmosPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.documents.azure.com'
  location: 'global'
}

// Link DNS zone to VNet
resource cosmosPrivateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  name: '${namePrefix}cosmos-dns-link'
  parent: cosmosPrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

// DNS A record for Cosmos DB private endpoint
resource cosmosPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: cosmosPrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: {
          privateDnsZoneId: cosmosPrivateDnsZone.id
        }
      }
    ]
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
var openaiIpRules = [for ip in allowedDevIpAddresses: {
  value: ip
}]

resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiAccountName
  kind: 'OpenAI'
  location: location
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: empty(allowedDevIpAddresses) ? 'Disabled' : 'Enabled'
    networkAcls: empty(allowedDevIpAddresses) ? null : {
      defaultAction: 'Deny'
      ipRules: openaiIpRules
      virtualNetworkRules: [
        {
          id: privateEndpointsSubnet.id
          ignoreMissingVnetServiceEndpoint: false
        }
      ]
    }
    disableLocalAuth: openAiDisableLocalAuth
  }
}

// Private endpoint for OpenAI
resource openaiPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: '${namePrefix}openai-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointsSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: '${namePrefix}openai-plink'
        properties: {
          privateLinkServiceId: openai.id
          groupIds: ['account']
        }
      }
    ]
  }
}

// Private DNS zone for OpenAI
resource openaiPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.openai.azure.com'
  location: 'global'
}

// Link DNS zone to VNet
resource openaiPrivateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  name: '${namePrefix}openai-dns-link'
  parent: openaiPrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

// DNS A record for OpenAI private endpoint
resource openaiPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: openaiPrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: {
          privateDnsZoneId: openaiPrivateDnsZone.id
        }
      }
    ]
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

var kvIpRules = [for ip in allowedDevIpAddresses: {
  value: ip
}]

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  // Make KV name deterministic but unique within the RG to avoid collisions when the same prefix was used elsewhere
  name: toLower('${namePrefix}kv${substring(uniqueString(resourceGroup().id), 0, 6)}')
  location: location
  properties: {
    tenantId: subscription().tenantId
    enableSoftDelete: true
    publicNetworkAccess: empty(allowedDevIpAddresses) ? 'Disabled' : 'Enabled'
    networkAcls: empty(allowedDevIpAddresses) ? null : {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      ipRules: kvIpRules
      virtualNetworkRules: [
        {
          id: privateEndpointsSubnet.id
          ignoreMissingVnetServiceEndpoint: false
        }
      ]
    }
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

// Private endpoint for Key Vault
resource kvPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: '${namePrefix}kv-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointsSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: '${namePrefix}kv-plink'
        properties: {
          privateLinkServiceId: kv.id
          groupIds: ['vault']
        }
      }
    ]
  }
}

// Private DNS zone for Key Vault
resource kvPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
}

// Link DNS zone to VNet
resource kvPrivateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  name: '${namePrefix}kv-dns-link'
  parent: kvPrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

// DNS A record for Key Vault private endpoint
resource kvPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: kvPrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: {
          privateDnsZoneId: kvPrivateDnsZone.id
        }
      }
    ]
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

// ---------------- Function App (optional) ----------------
@description('Secure OpenAI API key for Function (leave empty to use Managed Identity)')
@secure()
param openAiApiKey string = ''

var storageName = toLower(replace('${namePrefix}st${uniqueString(resourceGroup().id)}','-',''))

var storageIpRules = [for ip in allowedDevIpAddresses: {
  value: ip
  action: 'Allow'
}]

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = if (deployFunction) {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: empty(allowedDevIpAddresses) ? 'Disabled' : 'Enabled'
    networkAcls: empty(allowedDevIpAddresses) ? null : {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      ipRules: storageIpRules
      virtualNetworkRules: [
        {
          id: privateEndpointsSubnet.id
          action: 'Allow'
        }
      ]
    }
  }
}

// Private endpoint for Storage Account
resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = if (deployFunction) {
  name: '${namePrefix}st-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointsSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: '${namePrefix}st-plink'
        properties: {
          privateLinkServiceId: storage.id
          groupIds: ['blob']
        }
      }
    ]
  }
}

// Private DNS zone for Storage Account
resource storagePrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = if (deployFunction) {
  name: 'privatelink.blob.${environment().suffixes.storage}'
  location: 'global'
}

// Link DNS zone to VNet
resource storagePrivateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (deployFunction) {
  name: '${namePrefix}st-dns-link'
  parent: storagePrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

// DNS A record for Storage Account private endpoint
resource storagePrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = if (deployFunction) {
  name: 'default'
  parent: storagePrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: {
          privateDnsZoneId: storagePrivateDnsZone.id
        }
      }
    ]
  }
}

// Consumption plan
resource funcPlan 'Microsoft.Web/serverfarms@2023-12-01' = if (deployFunction) {
  name: '${namePrefix}-func-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {}
}

// Function App (Node 20, Linux)
// Retrieve storage keys only after storage resource defined
var storageKeys = deployFunction ? listKeys(storage.id, '2023-01-01') : null
var storageConn = deployFunction ? 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storageKeys.keys[0].value};EndpointSuffix=${environment().suffixes.storage}' : ''

// Base app settings
var functionBaseAppSettings = deployFunction ? [
  {
    name: 'AzureWebJobsStorage'
    value: storageConn
  }
  {
    name: 'FUNCTIONS_EXTENSION_VERSION'
    value: '~4'
  }
  {
    name: 'FUNCTIONS_WORKER_RUNTIME'
    value: 'node'
  }
  {
    name: 'WEBSITE_RUN_FROM_PACKAGE'
    value: '1'
  }
  {
    name: 'WEBSITE_NODE_DEFAULT_VERSION'
    value: '~20'
  }
  {
    name: 'OPENAI_ENDPOINT'
  // Use account-specific OpenAI endpoint (cognitive endpoint may be regional generic)
  value: 'https://${openAiAccountName}.openai.azure.com/'
  }
  {
    name: 'OPENAI_DEPLOYMENT'
    value: openAiDeploymentName
  }
] : []


resource functionApp 'Microsoft.Web/sites@2023-12-01' = if (deployFunction) {
  name: '${namePrefix}-func'
  location: location
  kind: 'functionapp,linux'
  properties: {
    httpsOnly: true
    serverFarmId: funcPlan.id
    reserved: true // required for Linux consumption Function Apps
    virtualNetworkSubnetId: resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'container-apps-subnet')
    siteConfig: {
      appSettings: empty(openAiApiKey) ? functionBaseAppSettings : concat(functionBaseAppSettings, [
        {
          name: 'OPENAI_API_KEY'
          value: openAiApiKey
        }
      ])
      vnetRouteAllEnabled: true
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
  tags: {
    component: 'function'
  }
}

// (storageListKeys var defined earlier)

output functionAppName string = deployFunction ? functionApp.name : ''
output functionAppDefaultUrl string = deployFunction ? 'https://${functionApp.name}.azurewebsites.net' : ''
