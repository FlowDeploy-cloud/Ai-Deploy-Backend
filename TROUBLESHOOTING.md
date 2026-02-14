# Deployment Troubleshooting Guide

## Issue: Deployment shows "success" but application is not accessible

This happens when the deployment process completes but the application doesn't actually start or isn't accessible.

## Quick Diagnosis

### 1. Check Deployment Health

Use the health endpoint to check the actual status:

```bash
# Get your deployment ID from the dashboard
DEPLOYMENT_ID="your-deployment-id"
TOKEN="your-jwt-token"

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/deployments/$DEPLOYMENT_ID/health
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "deployment_id": "abc123",
    "status": "deployed",
    "frontend": {
      "name": "user1_abc123_frontend",
      "port": 3102,
      "url": "http://abc123.projectmarket.in",
      "running": true,
      "status": "online",
      "uptime": 1234567890,
      "memory": 52428800,
      "cpu": 0.5
    },
    "backend": null
  }
}
```

If `running` is `false`, the app is not running!

### 2. SSH into VPS and Check Manually

```bash
ssh root@160.250.204.184
password: YxAy#hjJS5Vp
```

#### Check PM2 Processes

```bash
# List all PM2 processes
pm2 list

# Check specific app (replace with your PM2 name)
pm2 show user1_abc123_frontend

# View logs
pm2 logs user1_abc123_frontend --lines 50
```

**What to look for:**
- Status should be `online`
- If status is `errored` or `stopped`, check the logs
- Look for errors like "port already in use", "module not found", etc.

#### Check Port

```bash
# Check if port 3102 is in use
lsof -i :3102

# Try accessing locally
curl http://localhost:3102
```

**What to look for:**
- If `lsof` shows nothing, the app isn't listening on that port
- If `curl` returns a response, the app is working but Nginx might be misconfigured

#### Check Nginx

```bash
# Check Nginx configuration for your subdomain
ls -la /etc/nginx/sites-enabled/ | grep 3102

# View the config
cat /etc/nginx/sites-enabled/abc123-3102.conf

# Test Nginx configuration
nginx -t

# Reload Nginx if config is valid
systemctl reload nginx
```

### 3. Common Issues

#### Issue: PM2 process not running

**Symptoms:**
- PM2 list shows process as "errored" or "stopped"
- Port is not in use

**Solutions:**

```bash
# View error logs
pm2 logs <app-name> --err --lines 100

# Try starting manually
cd /path/to/app
pm2 start ecosystem.config.js --name <app-name>

# If build is needed
npm run build
pm2 restart <app-name>
```

#### Issue: Port already in use

**Symptoms:**
- Error: "EADDRINUSE: address already in use"
- PM2 process fails to start

**Solutions:**

```bash
# Find what's using the port
lsof -i :3102

# Kill the process
kill -9 <PID>

# Restart PM2 app
pm2 restart <app-name>
```

#### Issue: Application started but crashes immediately

**Symptoms:**
- PM2 shows "online" then quickly goes to "errored"
- High restart count

**Solutions:**

```bash
# Check error logs
pm2 logs <app-name> --err --lines 50

# Common causes:
# - Missing dependencies
# - Wrong Node.js version
# - Missing environment variables
# - Code errors

# Fix and restart
cd /path/to/app
npm install  # if dependencies missing
pm2 restart <app-name>
```

#### Issue: Nginx not configured correctly

**Symptoms:**
- App runs locally (curl localhost:3102 works)
- External URL returns 502 Bad Gateway or 404

**Solutions:**

```bash
# Check Nginx error log
tail -f /var/log/nginx/error.log

# Verify config
cat /etc/nginx/sites-enabled/<config-name>

# Should have:
# proxy_pass http://localhost:3102;

# Test and reload
nginx -t
systemctl reload nginx
```

#### Issue: ClawdBot failed to deploy

**Symptoms:**
- Deployment marked as "failed"
- Repository not cloned
- No files in app directory

**Solutions:**

```bash
# Check if ClawdBot is accessible
ls -la /root/.openclaw/workspace/server-dashboard/ai_deployer.py

# Try running ClawdBot manually
cd /root/.openclaw/workspace/server-dashboard
python3 << 'EOF'
from ai_deployer import ai_auto_deploy

result = ai_auto_deploy(
    repo_url='https://github.com/user/repo',
    port=3105,
    domain='test.projectmarket.in',
    app_name='test_app'
)
print(result)
EOF
```

### 4. Using the Verification Script

We've included a verification script that checks everything:

```bash
# On VPS
cd /path/to/backend
chmod +x verify-deployment.sh

# Run verification
./verify-deployment.sh <pm2-app-name> <port>

# Example
./verify-deployment.sh user1_abc123_frontend 3102
```

**Output will show:**
1. ✅ PM2 process status
2. ✅ Port usage
3. ✅ Local HTTP response
4. ✅ Nginx configuration
5. ✅ Application files

### 5. Backend API Health Check

From your local machine:

```bash
# Login first
TOKEN=$(curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "YourPassword1"
  }' | jq -r '.data.token')

# Get your deployments
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/deployments

# Check specific deployment health
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/deployments/<deployment-id>/health | jq
```

### 6. Fixing a Failed Deployment

If a deployment shows success but isn't working:

#### Option 1: Restart the deployment

```bash
# Via API
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/deployments/<deployment-id>/restart
```

#### Option 2: Manual fix on VPS

```bash
ssh root@160.250.204.184

# Find the app
pm2 list | grep <your-subdomain>

# Check logs for errors
pm2 logs <app-name> --lines 100

# Common fixes:

# 1. Rebuild and restart
cd /root/deployments/<app-name>
npm install
npm run build
pm2 restart <app-name>

# 2. Check environment variables
pm2 env <app-name>

# 3. Check if dependencies are missing
cd /root/deployments/<app-name>
npm install
pm2 restart <app-name>
```

#### Option 3: Redeploy

Delete the deployment and try again:

```bash
# Via API
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/deployments/<deployment-id>

# Then create new deployment from dashboard
```

## Prevention

The backend now includes automatic verification:
- After deployment, it checks if PM2 process is running
- Verifies the port is active
- Only marks as "deployed" if verification passes

If verification fails, you'll see:
```
⚠️ Deployment completed but verification failed
Application may not be running properly
```

## Getting Help

If none of the above works:

1. **Get PM2 logs:**
   ```bash
   pm2 logs <app-name> --lines 200 > deployment-error.log
   ```

2. **Get Nginx logs:**
   ```bash
   tail -100 /var/log/nginx/error.log > nginx-error.log
   ```

3. **Get backend logs:**
   Look at the terminal where your backend is running

4. **Check deployment logs via API:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:4000/api/deployments/<deployment-id>/logs
   ```

## Summary

The deployment process is now more robust with:
- ✅ Post-deployment verification
- ✅ PM2 status checks
- ✅ Port availability checks
- ✅ Health check API endpoint
- ✅ Detailed logging
- ✅ Verification script

Always check the `/health` endpoint after deployment to ensure everything is working!
