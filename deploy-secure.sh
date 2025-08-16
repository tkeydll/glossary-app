#!/bin/bash

# Deployment script for Glossary App with Virtual Network Security
# This script deploys the infrastructure with all resources secured within a virtual network

set -e

# Configuration
RESOURCE_GROUP_NAME="rg-glossary-secure"
LOCATION="japaneast"
DEPLOYMENT_NAME="glossary-secure-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Deploying Glossary App with Network Security${NC}"
echo "=================================================="

# Get current public IP for development access
echo -e "${YELLOW}📡 Detecting current public IP for development access...${NC}"
CURRENT_IP=$(curl -s https://api.ipify.org)
if [ $? -eq 0 ] && [ -n "$CURRENT_IP" ]; then
    echo -e "${GREEN}✅ Current IP detected: $CURRENT_IP${NC}"
    DEV_IP_PARAM="\"$CURRENT_IP/32\""
else
    echo -e "${RED}❌ Failed to detect current IP. Using empty array (private network only).${NC}"
    DEV_IP_PARAM="[]"
fi

# Check if resource group exists
echo -e "${YELLOW}🏗️ Checking resource group...${NC}"
if ! az group show --name "$RESOURCE_GROUP_NAME" --output none 2>/dev/null; then
    echo -e "${YELLOW}Creating resource group: $RESOURCE_GROUP_NAME${NC}"
    az group create --name "$RESOURCE_GROUP_NAME" --location "$LOCATION"
    echo -e "${GREEN}✅ Resource group created${NC}"
else
    echo -e "${GREEN}✅ Resource group already exists${NC}"
fi

# Deploy infrastructure
echo -e "${YELLOW}🚀 Deploying infrastructure...${NC}"
cat > /tmp/deploy-params.json << EOF
{
  "\$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "namePrefix": { "value": "gloss$(date +%m%d)" },
    "location": { "value": "$LOCATION" },
    "enableCosmosFreeTier": { "value": true },
    "useServerless": { "value": false },
    "deployFunction": { "value": true },
    "openAiAccountName": { "value": "gloss$(date +%m%d)aoai" },
    "openAiDeploymentName": { "value": "glossary-model" },
    "openAiDisableLocalAuth": { "value": false },
    "allowedDevIpAddresses": { "value": [$DEV_IP_PARAM] },
    "vnetAddressSpace": { "value": "10.0.0.0/16" },
    "containerAppsSubnetAddressSpace": { "value": "10.0.1.0/24" },
    "privateEndpointsSubnetAddressSpace": { "value": "10.0.2.0/24" },
    "cosmosDbName": { "value": "glossary" },
    "cosmosContainerName": { "value": "terms" },
    "cosmosContainerThroughput": { "value": 400 },
    "kvSku": { "value": "standard" },
    "openAiApiKey": { "value": "" }
  }
}
EOF

echo -e "${BLUE}📋 Deployment parameters:${NC}"
echo "  Resource Group: $RESOURCE_GROUP_NAME"
echo "  Location: $LOCATION"
echo "  Deployment Name: $DEPLOYMENT_NAME"
echo "  Allowed Dev IPs: $DEV_IP_PARAM"
echo ""

# Validate template first
echo -e "${YELLOW}🔍 Validating Bicep template...${NC}"
az deployment group validate \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --template-file infra/main.bicep \
    --parameters @/tmp/deploy-params.json \
    --output table

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Template validation successful${NC}"
else
    echo -e "${RED}❌ Template validation failed${NC}"
    exit 1
fi

# Deploy
echo -e "${YELLOW}🚀 Starting deployment...${NC}"
az deployment group create \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --name "$DEPLOYMENT_NAME" \
    --template-file infra/main.bicep \
    --parameters @/tmp/deploy-params.json \
    --output table

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    
    # Get deployment outputs
    echo -e "${YELLOW}📊 Getting deployment outputs...${NC}"
    COSMOS_ENDPOINT=$(az deployment group show --resource-group "$RESOURCE_GROUP_NAME" --name "$DEPLOYMENT_NAME" --query "properties.outputs.cosmosEndpoint.value" -o tsv)
    OPENAI_ENDPOINT=$(az deployment group show --resource-group "$RESOURCE_GROUP_NAME" --name "$DEPLOYMENT_NAME" --query "properties.outputs.openAiEndpoint.value" -o tsv)
    FUNCTION_URL=$(az deployment group show --resource-group "$RESOURCE_GROUP_NAME" --name "$DEPLOYMENT_NAME" --query "properties.outputs.functionAppDefaultUrl.value" -o tsv)
    
    echo -e "${GREEN}🎉 Deployment Summary:${NC}"
    echo "  Cosmos DB Endpoint: $COSMOS_ENDPOINT"
    echo "  OpenAI Endpoint: $OPENAI_ENDPOINT"
    echo "  Function App URL: $FUNCTION_URL"
    echo ""
    echo -e "${BLUE}🔒 Security Configuration:${NC}"
    echo "  ✅ All resources deployed within virtual network"
    echo "  ✅ Private endpoints configured for all services"
    echo "  ✅ Public access restricted to development IPs only"
    echo "  ✅ Inter-service communication via private network"
    echo ""
    echo -e "${YELLOW}💡 Next Steps:${NC}"
    echo "  1. Configure your applications to use the private endpoints"
    echo "  2. Test connectivity from within the virtual network"
    echo "  3. Update DNS settings if needed for development access"
    echo "  4. Monitor network traffic and security compliance"
    
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Cleanup
rm -f /tmp/deploy-params.json

echo -e "${GREEN}🏁 Script completed successfully!${NC}"