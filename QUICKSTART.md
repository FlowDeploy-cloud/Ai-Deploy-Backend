# Quick Start Guide

Get ClawDeploy backend up and running in 5 minutes!

## Prerequisites Checklist

- [ ] Node.js 16+ installed
- [ ] MongoDB installed and running (or MongoDB Atlas account)
- [ ] SSH access to deployment server (160.250.204.184)
- [ ] ClawdBot AI Deployer running on server

## 5-Minute Setup

### 1. Install Dependencies (30 seconds)

```bash
cd backend
npm install
```

### 2. Setup Database (1 minute)

```bash
# Option A: Local MongoDB (Ubuntu/Debian)
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Option B: MongoDB Atlas (Cloud - Free)
# 1. Go to https://www.mongodb.com/cloud/atlas
# 2. Create free account and cluster
# 3. Get connection string

# Run setup script
npm run setup-db
```

### 3. Configure Environment (1 minute)

```bash
cp .env.example .env
nano .env
```

**Minimum required changes:**
- `JWT_SECRET` - Change to a random string
- `MONGODB_URI` - Set to your MongoDB connection string
  - Local: `mongodb://localhost:27017/clawdeploy`
  - Atlas: `mongodb+srv://username:password@cluster.mongodb.net/clawdeploy`
- `SSH_PASSWORD` - Set your VPS password (already set to: YxAy#hjJS5Vp)

### 4. Test Connection (30 seconds)

```bash
npm test
```

You should see:
```
✅ SSH connection successful
✅ Command execution successful
✅ Found X PM2 processes
...
🎉 All tests passed!
```

### 5. Start Server (30 seconds)

```bash
npm start
```

You should see:
```
🚀 ================================
🚀 ClawDeploy SaaS Backend Started
🚀 ================================
🌐 Server running on port: 4000
...
```

## Quick Test

Open a new terminal:

```bash
# Test health endpoint
curl http://localhost:4000/health

# Expected: {"success":true,"message":"ClawDeploy SaaS Backend is running",...}
```

## Create Your First User

```bash
curl -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "Admin@123456"
  }'
```

**Save the token from response!**

## Deploy Your First App

```bash
# Replace YOUR_TOKEN with token from signup
curl -X POST http://localhost:4000/api/deployments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test App",
    "frontend_repo": "https://github.com/facebook/create-react-app",
    "frontend_description": "React test application"
  }'
```

## Monitor Deployment

```bash
# Get your deployments
curl http://localhost:4000/api/deployments \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check logs (replace DEPLOYMENT_ID)
curl http://localhost:4000/api/deployments/DEPLOYMENT_ID/logs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Deploy to VPS Server

### Option 1: Manual Deployment

```bash
# SSH into server
ssh root@160.250.204.184

# Clone/copy project
cd /root/.openclaw/workspace
git clone YOUR_REPO deploy-saas
cd deploy-saas

# Install and setup
npm install --production
cp .env.example .env
nano .env  # Update values

# Start with PM2
pm2 start src/app.js --name deploy-saas-backend
pm2 save
```

### Option 2: Automated Deployment (Linux/Mac)

```bash
chmod +x deploy.sh
./deploy.sh
```

## Verify Deployment

```bash
# Check if backend is running on VPS
curl http://160.250.204.184:4000/health

# Check PM2 status
ssh root@160.250.204.184 "pm2 list"

# View logs
ssh root@160.250.204.184 "pm2 logs deploy-saas-backend --lines 50"
```

## Common Issues

### "SSH connection failed"
- Check `.env` has correct SSH_PASSWORD
- Test: `ssh root@160.250.204.184`

### "Database connection failed"
- Check MongoDB is running: `sudo systemctl status mongod`
- Verify MONGODB_URI in `.env`

### "Port 4000 already in use"
- Kill process: `lsof -i :4000` then `kill -9 PID`
- Or change PORT in `.env`

### "ClawdBot not found"
- Verify CLAWDBOT_PATH in `.env` points to ai_deployer.py
- Test: `ssh root@160.250.204.184 "ls -la /root/.openclaw/workspace/server-dashboard/ai_deployer.py"`

## Next Steps

1. **Setup Nginx** for API domain (optional)
   - See README.md "Nginx Configuration for Backend API"

2. **Enable HTTPS** with Let's Encrypt
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d api.projectmarket.in
   ```

3. **Setup Monitoring**
   - PM2 monitoring: `pm2 monit`
   - Logs: `pm2 logs deploy-saas-backend`

4. **Build Frontend Dashboard**
   - React app that connects to this backend
   - Use API examples from API_EXAMPLES.md

5. **Configure Backups**
   ```bash
   # MongoDB backup
   mongodump --uri="mongodb://localhost:27017/clawdeploy" --out=backup/
   ```

## Production Checklist

- [ ] Change all default passwords
- [ ] Setup HTTPS/SSL
- [ ] Configure firewall (ufw)
- [ ] Setup database backups
- [ ] Configure log rotation
- [ ] Setup monitoring/alerts
- [ ] Document API for team
- [ ] Test disaster recovery

## Support & Resources

- **Documentation:** README.md
- **API Examples:** API_EXAMPLES.md
- **Full Requirements:** SAAS_BACKEND_PROMPT.md
- **Test Suite:** `npm test`

## Success! 🎉

Your ClawDeploy backend is now running and ready to deploy applications!

**Backend URL:** http://localhost:4000 (or http://160.250.204.184:4000)
**API Docs:** http://localhost:4000/
**Health Check:** http://localhost:4000/health

Happy deploying! 🚀
