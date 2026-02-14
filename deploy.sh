#!/bin/bash

# ClawDeploy SaaS Backend Deployment Script
# This script deploys the backend to the VPS server

echo "🚀 ClawDeploy Backend Deployment Script"
echo "======================================="

# Configuration
SERVER="root@160.250.204.184"
REMOTE_PATH="/root/.openclaw/workspace/deploy-saas"
PM2_NAME="deploy-saas-backend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "📦 Step 1: Creating deployment directory on server..."
ssh $SERVER "mkdir -p $REMOTE_PATH"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Directory created${NC}"
else
    echo -e "${RED}❌ Failed to create directory${NC}"
    exit 1
fi

echo ""
echo "📤 Step 2: Uploading files to server..."
rsync -avz --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '*.log' \
    . $SERVER:$REMOTE_PATH/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Files uploaded${NC}"
else
    echo -e "${RED}❌ Failed to upload files${NC}"
    exit 1
fi

echo ""
echo "📦 Step 3: Installing dependencies..."
ssh $SERVER "cd $REMOTE_PATH && npm install --production"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo "⚙️  Step 4: Setting up database..."
ssh $SERVER "cd $REMOTE_PATH && psql -U deployuser -d deploydb -f schema.sql 2>/dev/null || echo 'Database already exists'"

echo ""
echo "🔄 Step 5: Restarting PM2 process..."
ssh $SERVER "pm2 describe $PM2_NAME > /dev/null 2>&1 && pm2 restart $PM2_NAME || pm2 start $REMOTE_PATH/src/app.js --name $PM2_NAME"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ PM2 process started${NC}"
else
    echo -e "${RED}❌ Failed to start PM2 process${NC}"
    exit 1
fi

echo ""
echo "💾 Step 6: Saving PM2 configuration..."
ssh $SERVER "pm2 save"

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "📊 Server Status:"
ssh $SERVER "pm2 list | grep $PM2_NAME"

echo ""
echo "🌐 Backend URL: http://160.250.204.184:4000"
echo "📝 Check logs: ssh $SERVER 'pm2 logs $PM2_NAME'"
echo ""
