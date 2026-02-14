#!/bin/bash

# Deployment Verification Script
# Usage: ./verify-deployment.sh <app_name> <port>

APP_NAME=$1
PORT=$2

if [ -z "$APP_NAME" ] || [ -z "$PORT" ]; then
    echo "Usage: $0 <app_name> <port>"
    exit 1
fi

echo "==================================="
echo "Verifying Deployment: $APP_NAME"
echo "Expected Port: $PORT"
echo "==================================="
echo ""

# Check PM2 process
echo "1. Checking PM2 Process..."
pm2 list | grep "$APP_NAME"
PM2_STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.status")

if [ -z "$PM2_STATUS" ]; then
    echo "❌ PM2 process not found!"
    exit 1
elif [ "$PM2_STATUS" != "online" ]; then
    echo "❌ PM2 process status: $PM2_STATUS (not online)"
    echo ""
    echo "Recent PM2 Logs:"
    pm2 logs "$APP_NAME" --lines 20 --nostream
    exit 1
else
    echo "✅ PM2 process is online"
fi

echo ""

# Check port
echo "2. Checking Port $PORT..."
if lsof -i :$PORT > /dev/null 2>&1; then
    echo "✅ Port $PORT is in use"
    lsof -i :$PORT
else
    echo "❌ Port $PORT is not in use!"
    echo ""
    echo "Recent PM2 Logs:"
    pm2 logs "$APP_NAME" --lines 20 --nostream
    exit 1
fi

echo ""

# Check if accessible locally
echo "3. Testing Local Access..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT | grep -q "200\|301\|302"; then
    echo "✅ Application responds on localhost:$PORT"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT)
    echo "⚠️ HTTP response code: $HTTP_CODE"
    echo ""
    echo "Full Response:"
    curl -v http://localhost:$PORT 2>&1 | head -20
fi

echo ""

# Check Nginx config
echo "4. Checking Nginx Configuration..."
NGINX_CONFIGS=$(ls /etc/nginx/sites-enabled/*$PORT* 2>/dev/null)
if [ -n "$NGINX_CONFIGS" ]; then
    echo "✅ Found Nginx configs:"
    echo "$NGINX_CONFIGS"
    for config in $NGINX_CONFIGS; do
        echo ""
        echo "Config: $config"
        cat "$config"
    done
else
    echo "⚠️ No Nginx config found for port $PORT"
fi

echo ""

# Check application directory
echo "5. Checking Application Files..."
APP_DIR=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.pm_cwd")
if [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ]; then
    echo "✅ Application directory: $APP_DIR"
    echo "Contents:"
    ls -lah "$APP_DIR" | head -20
else
    echo "⚠️ Application directory not found or not accessible"
fi

echo ""
echo "==================================="
echo "Verification Complete"
echo "==================================="
