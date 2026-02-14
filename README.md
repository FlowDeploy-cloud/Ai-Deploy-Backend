# ClawDeploy SaaS Backend

A powerful SaaS backend for automated deployment of web applications using AI (ClawdBot) via SSH.

## Features

- 🚀 **Automated Deployments** - Deploy frontend and backend applications from GitHub repos
- 🤖 **AI-Powered** - Uses ClawdBot AI for intelligent deployment detection and setup
- 🔐 **Secure Authentication** - JWT tokens and API key support
- 🌐 **Auto Subdomain Assignment** - Automatic subdomain generation with Nginx configuration
- 📊 **Real-time Logs** - WebSocket support for live deployment logs
- 🔌 **Port Management** - Automatic port allocation and management
- 💾 **MongoDB Database** - Flexible NoSQL data storage for users and deployments
- 🔒 **SSH Management** - Secure SSH connection handling for remote deployments

## Prerequisites

- Node.js 16+ installed
- MongoDB database (local or Atlas)
- SSH access to deployment server
- Nginx installed on deployment server
- PM2 installed on deployment server
- ClawdBot AI Deployer installed on deployment server

## Installation

### 1. Clone and Install

```bash
cd backend
npm install
```

### 2. Setup Database

```bash
# Install MongoDB (Ubuntu/Debian)
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Or use MongoDB Atlas (cloud) - see MONGODB_SCHEMA.md

# Run setup script to create indexes and admin user
npm run setup-db
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update:

```env
# Server
PORT=4000
NODE_ENV=development

# SSH Configuration
SSH_HOST=160.250.204.184
SSH_USER=root
SSH_PASSWORD=your_ssh_password
SSH_PORT=22

# Database
MONGODB_URI=mongodb://localhost:27017/clawdeploy
# Or MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/clawdeploy

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRATION=7d

# Domain
BASE_DOMAIN=projectmarket.in

# Ports
MIN_PORT=3100
MAX_PORT=8900

# ClawdBot
CLAWDBOT_PATH=/root/.openclaw/workspace/server-dashboard/ai_deployer.py
```

### 4. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

## API Documentation

### Base URL
```
http://your-server:4000/api
```

### Authentication

All protected endpoints require either:
- **Bearer Token**: `Authorization: Bearer <token>`
- **API Key**: `X-API-Key: <api_key>`

### Endpoints

#### Auth

**POST /api/auth/signup**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "plan": "free"
}
```

**POST /api/auth/login**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**GET /api/auth/profile**
- Headers: `Authorization: Bearer <token>`

**POST /api/auth/regenerate-api-key**
- Headers: `Authorization: Bearer <token>`

#### Deployments

**POST /api/deployments**
```json
{
  "name": "My Portfolio",
  "frontend_repo": "https://github.com/user/frontend-repo",
  "backend_repo": "https://github.com/user/backend-repo",
  "frontend_description": "React portfolio website",
  "backend_description": "Node.js API server",
  "env_vars": {
    "API_KEY": "xxx",
    "DATABASE_URL": "mongodb://localhost:27017/db"
  }
}
```

**GET /api/deployments**
- Get all deployments for current user
- Query params: `limit`, `offset`

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
