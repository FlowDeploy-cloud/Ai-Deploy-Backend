# 🚀 ClawDeploy SaaS Backend

A powerful SaaS backend for automated deployment of web applications using AI (ClawdBot) via SSH. Deploy your full-stack applications with intelligent AI assistance, automated configuration, and real-time monitoring.

## ✨ Features

### Core Features
- 🚀 **Automated Deployments** - Deploy frontend and backend applications directly from GitHub repositories
- 🤖 **AI-Powered Setup** - Uses ClawdBot AI for intelligent deployment detection and configuration
- 🔐 **Secure Authentication** - JWT-based authentication with support for both local and GitHub OAuth
- 🌐 **Auto Subdomain Assignment** - Automatic subdomain generation with Nginx reverse proxy configuration
- 📊 **Real-time Logs** - WebSocket support for live deployment logs and status updates
- 🔌 **Smart Port Management** - Automatic port allocation and conflict resolution
- 💾 **MongoDB Database** - Flexible NoSQL database with optimized schemas and indexes
- 🔒 **SSH Management** - Secure SSH connection handling for remote server deployments

### Subscription & Payments
- 💳 **Razorpay Integration** - Complete payment gateway integration for subscriptions
- 📦 **Multiple Plans** - Starter, Growth, Business, and Enterprise plans
- 🔄 **Subscription Management** - Automatic renewal, cancellation, and upgrade handling
- ⚠️ **Usage Monitoring** - Real-time tracking and warnings for deployment limits
- 🚫 **Plan Restrictions** - Free plan users cannot deploy (paid plan required)

### Developer Features
- 🔄 **GitHub Integration** - OAuth login and direct repository access
- 📝 **Environment Variables** - Secure environment configuration for deployments
- 🔍 **Deployment Monitoring** - Track deployment status, logs, and health
- 🗑️ **Deployment Management** - Start, stop, restart, and delete deployments
- 📈 **Usage Analytics** - Track deployments, resources, and subscription usage

## 🛠️ Tech Stack

- **Runtime:** Node.js v16+
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT + bcrypt
- **Payment Gateway:** Razorpay
- **Real-time Communication:** Socket.io
- **SSH Client:** node-ssh
- **API Rate Limiting:** express-rate-limit
- **Security:** Helmet, CORS
- **Process Management:** Requires PM2 on deployment server

## 📋 Prerequisites

### Required Software
- **Node.js** 16+ (with npm)
- **MongoDB** 5.0+ (local installation or MongoDB Atlas)
- **SSH Access** to deployment server with root privileges

### Deployment Server Requirements
- **OS:** Linux (Ubuntu 20.04+ recommended)
- **Nginx** - for reverse proxy and SSL
- **PM2** - for process management
- **Git** - for cloning repositories
- **ClawdBot AI Deployer** - AI deployment assistant
- **Python 3.8+** - for ClawdBot
- **Node.js** - for running deployed applications

### External Services
- **GitHub OAuth App** - for GitHub authentication
- **Razorpay Account** - for payment processing
- **Domain/Subdomain** - configured DNS for deployments

## 🚀 Installation

### 1. Clone and Install Dependencies

```bash
# Navigate to backend directory
cd backend

# Install Node.js dependencies
npm install
```

### 2. Setup MongoDB Database

#### Option A: Local MongoDB
```bash
# Install MongoDB (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB service
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify MongoDB is running
sudo systemctl status mongod
```

#### Option B: MongoDB Atlas (Cloud)
1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Configure network access (allow your IP)
4. Create database user
5. Get connection string

#### Initialize Database
```bash
# Run setup script to create indexes and collections
npm run setup-db
```

### 3. Configure Environment Variables

Create a `.env` file in the backend directory:

```bash
# Copy example file
cp .env.example .env

# Edit with your configuration
nano .env
```

```env
# Server Configuration
PORT=4000
NODE_ENV=development

# SSH Configuration (Deployment Server)
SSH_HOST=160.250.204.184
SSH_USER=root
SSH_PASSWORD=your_ssh_password
SSH_PORT=22

# Database Configuration (MongoDB)
MONGODB_URI=mongodb://localhost:27017/clawdeploy
# Or MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/clawdeploy

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRATION=7d

# Domain Configuration
BASE_DOMAIN=projectmarket.in

# Port Range for Deployments
MIN_PORT=3100
MAX_PORT=8900

# ClawdBot Configuration
CLAWDBOT_PATH=/root/.openclaw/workspace/server-dashboard/ai_deployer.py

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Razorpay Payment Gateway
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=https://your-frontend-domain.com/auth/github/callback
```

### 4. Setup GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in details:
   - **Application name:** ClawDeploy
   - **Homepage URL:** https://your-frontend-domain.com
   - **Authorization callback URL:** https://your-frontend-domain.com/auth/github/callback
4. Copy Client ID and Client Secret to `.env`

### 5. Setup Razorpay (Optional for Payments)

1. Create account at [Razorpay](https://razorpay.com/)
2. Get API Keys from Dashboard
3. Configure webhook endpoint: `https://your-api-domain.com/api/payment/webhook`
4. Add keys to `.env`

### 6. Start Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Run tests
npm test
```

Server will start on `http://localhost:4000`

## 📚 API Documentation

### Base URL
```
Production: https://your-api-domain.com/api
Development: http://localhost:4000/api
```

### Authentication

All protected endpoints require either:
- **Bearer Token**: `Authorization: Bearer <jwt_token>`
- **API Key**: `X-API-Key: <user_api_key>`

### API Endpoints

#### 🔐 Authentication Routes (`/api/auth`)

**POST /api/auth/signup**
```json
Request:
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}

Response:
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": "user_id",
      "username": "john_doe",
      "email": "john@example.com",
      "plan": "free",
      "api_key": "generated_api_key"
    }
  }
}
```

**POST /api/auth/login**
```json
Request:
{
  "email": "john@example.com",
  "password": "SecurePass123"
}

Response: Same as signup
```

**GET /api/auth/profile**
```bash
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "user_id",
    "username": "john_doe",
    "email": "john@example.com",
    "plan": "free",
    "github_username": "johndoe",
    "avatar_url": "https://..."
  }
}
```

**POST /api/auth/regenerate-api-key**
```bash
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "api_key": "new_api_key"
  }
}
```

**GET /api/auth/github**
```
Redirects to GitHub OAuth authorization
```

**POST /api/auth/github/callback**
```json
Request:
{
  "code": "github_oauth_code"
}

Response: Same as login
```

#### 🚀 Deployment Routes (`/api/deployments`)

**POST /api/deployments**
```json
Request:
{
  "name": "My Portfolio",
  "frontend_repo": "https://github.com/user/frontend-repo",
  "backend_repo": "https://github.com/user/backend-repo",
  "frontend_description": "React portfolio website",
  "backend_description": "Node.js API server with MongoDB",
  "env_vars": {
    "API_KEY": "xxx",
    "DATABASE_URL": "mongodb://localhost:27017/db"
  }
}

Response:
{
  "success": true,
  "message": "Deployment started",
  "data": {
    "deployment_id": "dep_123",
    "name": "My Portfolio",
    "subdomain": "clever-panda-42",
    "status": "deploying"
  }
}
```

**GET /api/deployments**
```bash
Query Params: ?limit=50&offset=0

Response:
{
  "success": true,
  "data": [
    {
      "_id": "mongo_id",
      "deployment_id": "dep_123",
      "name": "My Portfolio",
      "subdomain": "clever-panda-42",
      "frontend_url": "https://clever-panda-42.projectmarket.in",
      "backend_url": "https://api-clever-panda-42.projectmarket.in",
      "status": "active",
      "createdAt": "2026-02-17T10:00:00Z"
    }
  ],
  "count": 1
}
```

**GET /api/deployments/:id**
```bash
Response:
{
  "success": true,
  "data": {
    "deployment_id": "dep_123",
    "name": "My Portfolio",
    "status": "active",
    "frontend_repo": "https://github.com/user/repo",
    "frontend_port": 3000,
    "backend_port": 4000,
    // ... full deployment details
  }
}
```

**DELETE /api/deployments/:id**
```bash
Response:
{
  "success": true,
  "message": "Deployment deleted successfully"
}
```

**POST /api/deployments/:id/start**
```bash
Response:
{
  "success": true,
  "message": "Deployment started successfully"
}
```

**POST /api/deployments/:id/stop**
```bash
Response:
{
  "success": true,
  "message": "Deployment stopped successfully"
}
```

**POST /api/deployments/:id/restart**
```bash
Response:
{
  "success": true,
  "message": "Deployment restarted successfully"
}
```

**GET /api/deployments/:id/logs**
```bash
Query Params: ?lines=100

Response:
{
  "success": true,
  "data": {
    "logs": ["log line 1", "log line 2", ...]
  }
}
```

#### 💳 Subscription Routes (`/api/subscription`)

**GET /api/subscription**
```bash
Response:
{
  "success": true,
  "data": {
    "plan_id": "starter",
    "plan_name": "Starter Plan",
    "status": "active",
    "current_start": "2026-01-01T00:00:00Z",
    "current_end": "2026-02-01T00:00:00Z",
    "limits": {
      "max_frontend": 2,
      "max_backend": 1
    }
  }
}
```

**POST /api/subscription/create**
```json
Request:
{
  "plan_id": "starter"
}

Response:
{
  "success": true,
  "data": {
    "subscription_id": "sub_123",
    "razorpay_order": { /* Razorpay order details */ }
  }
}
```

**POST /api/subscription/cancel**
```bash
Response:
{
  "success": true,
  "message": "Subscription cancelled successfully"
}
```

**GET /api/subscription/warnings**
```bash
Response:
{
  "success": true,
  "data": {
    "has_warnings": true,
    "warnings": [
      {
        "type": "expiring_soon",
        "severity": "warning",
        "message": "Your subscription expires in 3 days"
      }
    ]
  }
}
```

#### 💰 Payment Routes (`/api/payment`)

**POST /api/payment/webhook**
```bash
Razorpay webhook endpoint for payment events
```

**POST /api/payment/verify**
```json
Request:
{
  "razorpay_payment_id": "pay_123",
  "razorpay_subscription_id": "sub_123",
  "razorpay_signature": "signature"
}
```

#### 👤 User Routes (`/api/users`)

**GET /api/users/me**
```bash
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "user_id",
    "username": "john_doe",
    "email": "john@example.com",
    "plan": "starter",
    "subscription_status": "active"
  }
}
```

**GET /api/users/github/repos**
```bash
Response:
{
  "success": true,
  "data": {
    "repositories": [
      {
        "name": "my-repo",
        "full_name": "username/my-repo",
        "html_url": "https://github.com/username/my-repo",
        "description": "My awesome project",
        "language": "JavaScript",
        "private": false
      }
    ]
  }
}
```

**GET /api/deployments/:id**
- Get specific deployment with status

**POST /api/deployments/:id/stop**
- Stop deployment processes

**POST /api/deployments/:id/restart**
- Restart deployment processes

**DELETE /api/deployments/:id**
- Delete deployment and cleanup resources

**GET /api/deployments/:id/logs**
- Get deployment logs
- Query params: `lines` (default: 100)

**GET /api/deployments/:id/pm2-logs**
- Get PM2 process logs
- Query params: `target` (frontend|backend), `lines`

#### User

**GET /api/user/stats**
- Get user deployment statistics

**POST /api/user/plan**
```json
{
  "plan": "pro"
}
```

## WebSocket

### Connection

```javascript
const socket = io('http://your-server:4000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Real-time Deployment

```javascript
// Listen for logs
socket.on('log', (data) => {
  console.log(`[${data.type}] ${data.message}`);
});

// Listen for completion
socket.on('deployment_complete', (data) => {
  console.log('Deployment successful:', data.deployment);
});

// Listen for failures
socket.on('deployment_failed', (data) => {
  console.error('Deployment failed:', data.error);
});

// Trigger deployment
socket.emit('deploy', {
  name: 'My App',
  frontend_repo: 'https://github.com/user/app',
  frontend_description: 'React application'
});
```

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # Database connection
│   ├── middleware/
│   │   ├── auth.js              # Authentication middleware
│   │   └── validation.js        # Input validation
│   ├── models/
│   │   ├── User.js              # User model
│   │   ├── Deployment.js        # Deployment model
│   │   └── DeploymentLog.js     # Deployment log model
│   ├── routes/
│   │   ├── auth.js              # Auth routes
│   │   ├── deploy.js            # Deployment routes
│   │   └── user.js              # User routes
│   ├── services/
│   │   ├── SSHManager.js        # SSH connection manager
│   │   ├── ClawdBotService.js   # ClawdBot integration
│   │   ├── DeploymentService.js # Deployment orchestration
│   │   ├── NginxManager.js      # Nginx configuration
│   │   └── PortManager.js       # Port allocation
│   ├── utils/
│   │   └── SubdomainGenerator.js # Subdomain generation
│   └── app.js                   # Main application
├── .env                         # Environment variables
├── .env.example                 # Example environment
├── .gitignore
├── package.json
├── schema.sql                   # Database schema
└── README.md
```

## Deployment to Server

### Deploy to VPS

```bash
# SSH into server
ssh root@160.250.204.184

# Clone repository
cd /root/.openclaw/workspace
git clone <your-repo-url> deploy-saas
cd deploy-saas

# Install dependencies
npm install --production

# Setup database
npm run setup-db

# Configure environment
cp .env.example .env
nano .env  # Edit with server values

# Start with PM2
pm2 start src/app.js --name deploy-saas-backend
pm2 save
pm2 startup

# Configure Nginx (optional - for API endpoint)
sudo nano /etc/nginx/sites-available/api.projectmarket.in
```

### Nginx Configuration for Backend API

```nginx
server {
    listen 80;
    server_name api.projectmarket.in;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api.projectmarket.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Testing

### Test SSH Connection

```bash
npm run test-ssh
```

### Test Deployment Flow

```bash
curl -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPass123"
  }'

# Save the token from response
TOKEN="<your_token>"

# Create deployment
curl -X POST http://localhost:4000/api/deployments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test App",
    "frontend_repo": "https://github.com/facebook/create-react-app",
    "frontend_description": "React test app"
  }'
```

## Monitoring

### Check Backend Status

```bash
pm2 list
pm2 logs deploy-saas-backend
pm2 monit
```

### Check Database

```bash
mongosh clawdeploy
db.users.find().pretty()
db.deployments.find().pretty()
```

### Check SSH Connection

```bash
pm2 logs deploy-saas-backend | grep SSH
```

## Troubleshooting

### SSH Connection Failed

- Verify SSH credentials in `.env`
- Check firewall rules: `sudo ufw status`
- Test SSH manually: `ssh root@160.250.204.184`

### Database Connection Error

- Check MongoDB is running: `systemctl status mongod`
- Verify database credentials
- Check connection string format

### Port Already in Use

- Check running processes: `lsof -i :4000`
- Kill process: `kill -9 <PID>`
- Or change PORT in `.env`

### Nginx Configuration Error

- Test config: `sudo nginx -t`
- Check logs: `tail -f /var/log/nginx/error.log`
- Verify domain DNS: `nslookup subdomain.projectmarket.in`

## Security Best Practices

1. **Change default passwords** in `.env`
2. **Use SSH keys** instead of password authentication
3. **Enable HTTPS** with Let's Encrypt
4. **Implement rate limiting** (already configured)
5. **Regular backups** of database
6. **Monitor logs** for suspicious activity
7. **Update dependencies** regularly: `npm audit fix`

## License

MIT

## Author

monu564100

## Support

For issues and questions, please open a GitHub issue.
