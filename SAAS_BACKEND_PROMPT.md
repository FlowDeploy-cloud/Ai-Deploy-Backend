# Complete AI Agent Prompt for ClawDeploy Backend Development

You are building a backend for ClawDeploy - a SaaS platform that automatically deploys web applications from GitHub repos using AI (ClawdBot).

## Server Access
- **SSH:** root@160.250.204.184
- **Password:** [Provided separately]
- **Domain:** projectmarket.in (DNS configured)
- **Server:** Ubuntu VPS, 3GB RAM, 60GB disk

## What Already Exists

### Existing Services Running (DO NOT TOUCH):
- **Port 3031:** ClawDeploy platform (deploy-platform)
- **Port 8080:** Server dashboard with ClawdBot
- **Port 5051:** Calendar app
- **Port 5052:** Study dashboard
- Various telegram bots and services

### Working ClawdBot AI Deployer:
- **Location:** `/root/.openclaw/workspace/server-dashboard/ai_deployer.py`
- **Function:** `ai_auto_deploy(repo_url, port, domain, app_name)`
- **Capabilities:** Auto-detects frameworks, installs dependencies, starts with PM2
- Supports: Node.js, Python, Go, PHP, Ruby, Static HTML

### Current Platform:
- **Location:** `/root/.openclaw/workspace/deploy-platform/`
- **Database:** JSON files (`users_db.json`, `deployments_db.json`)
- **Features:** User auth, GitHub deployment, AI modifications, subdomain assignment

## Your Mission: Build External SaaS Backend

Create a **new, separate** SaaS platform at `/root/.openclaw/workspace/deploy-saas/` that:

1. **Allows external users** to sign up and deploy projects
2. **Uses SSH** to connect to the deployment server (160.250.204.184)
3. **Integrates ClawdBot** for automated deployments
4. **Manages everything remotely** via SSH commands

## Architecture Requirements

```
┌─────────────────────────────────────────┐
│  SaaS Backend (New - Your Task)         │
│  Port: 4000                              │
│  Location: /root/.openclaw/workspace/   │
│           deploy-saas/                   │
│                                          │
│  ┌───────────────────────────────────┐  │
│  │ API Endpoints:                    │  │
│  │ - POST /api/auth/signup           │  │
│  │ - POST /api/auth/login            │  │
│  │ - GET  /api/user/profile          │  │
│  │ - POST /api/deploy                │  │
│  │ - GET  /api/deployments           │  │
│  │ - GET  /api/deployment/:id        │  │
│  │ - POST /api/deployment/:id/stop   │  │
│  │ - POST /api/deployment/:id/restart│  │
│  │ - POST /api/deployment/:id/modify │  │
│  │ - DELETE /api/deployment/:id      │  │
│  │ - GET  /api/deployment/:id/logs   │  │
│  │ - POST /api/subdomain/create      │  │
│  └───────────────────────────────────┘  │
│                 ↓                        │
│        SSH Connection Library            │
│         (node-ssh or paramiko)           │
│                 ↓                        │
└──────────────────┬──────────────────────┘
                   │ SSH
                   ↓
┌─────────────────────────────────────────┐
│  Deployment Server (160.250.204.184)    │
│                                          │
│  ┌───────────────────────────────────┐  │
│  │ ClawdBot AI Deployer              │  │
│  │ /root/.openclaw/workspace/        │  │
│  │  server-dashboard/ai_deployer.py  │  │
│  └───────────────────────────────────┘  │
│                 ↓                        │
│  ┌───────────────────────────────────┐  │
│  │ PM2 Process Manager               │  │
│  │ Runs deployed apps                │  │
│  └───────────────────────────────────┘  │
│                 ↓                        │
│  ┌───────────────────────────────────┐  │
│  │ Nginx Reverse Proxy               │  │
│  │ Routes *.projectmarket.in         │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Technology Stack

**Backend Framework:** Choose one:
- **Node.js:** Express.js + TypeScript
- **Python:** FastAPI or Flask
- **Go:** Gin or Fiber

**Database:** 
- **PostgreSQL** (recommended for production)
- Or continue with JSON files for MVP

**SSH Library:**
- **Node.js:** `node-ssh` or `ssh2`
- **Python:** `paramiko`
- **Go:** `golang.org/x/crypto/ssh`

**Authentication:**
- JWT tokens
- Bcrypt password hashing
- Session management

## Detailed Requirements

### 1. User Authentication System

**Database Schema:**
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE,
    plan VARCHAR(20) DEFAULT 'free',
    max_deployments INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deployments (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    deployment_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(100),
    subdomain VARCHAR(20) UNIQUE NOT NULL,
    frontend_repo TEXT,
    backend_repo TEXT,
    frontend_description TEXT,
    backend_description TEXT,
    frontend_port INT,
    backend_port INT,
    frontend_url TEXT,
    backend_url TEXT,
    custom_domain TEXT,
    env_vars JSONB,
    status VARCHAR(20) DEFAULT 'deploying',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deployment_logs (
    id SERIAL PRIMARY KEY,
    deployment_id INT REFERENCES deployments(id),
    log_type VARCHAR(20),
    message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. SSH Connection Manager

**Features:**
- Maintain persistent SSH connection pool
- Automatic reconnection on failure
- Command execution with timeout
- File transfer capabilities
- Secure credential management

**Example (Node.js):**
```javascript
const { NodeSSH } = require('node-ssh');

class SSHManager {
    constructor() {
        this.ssh = new NodeSSH();
        this.connected = false;
    }

    async connect() {
        await this.ssh.connect({
            host: '160.250.204.184',
            username: 'root',
            password: process.env.SSH_PASSWORD,
            port: 22,
            readyTimeout: 30000
        });
        this.connected = true;
    }

    async executeCommand(command, options = {}) {
        if (!this.connected) await this.connect();
        
        const result = await this.ssh.execCommand(command, {
            cwd: options.cwd || '/root',
            ...options
        });
        
        return {
            stdout: result.stdout,
            stderr: result.stderr,
            code: result.code
        };
    }

    async deployWithClawdBot(repoUrl, port, domain, appName) {
        const command = `cd /root/.openclaw/workspace/server-dashboard && python3 -c "
from ai_deployer import ai_auto_deploy
result = ai_auto_deploy('${repoUrl}', ${port}, '${domain}', '${appName}')
print(result)
"`;
        return await this.executeCommand(command);
    }
}
```

### 3. Deployment Orchestration

**Flow:**
```
1. User submits deployment request
   ↓
2. Validate repo URL and user limits
   ↓
3. Generate unique subdomain (6 chars)
   ↓
4. Find free port via SSH (3100-8900)
   ↓
5. Execute ClawdBot via SSH:
   python3 -c "from ai_deployer import ai_auto_deploy; 
   ai_auto_deploy('repo', port, domain, app_name)"
   ↓
6. Stream logs back to user
   ↓
7. Create nginx config via SSH
   ↓
8. Reload nginx via SSH
   ↓
9. Mark deployment as 'deployed'
   ↓
10. Return subdomain URL to user
```

### 4. Core API Endpoints

#### POST /api/deploy
```json
{
    "frontend_repo": "https://github.com/user/frontend",
    "backend_repo": "https://github.com/user/backend",
    "frontend_description": "React e-commerce site",
    "backend_description": "Node.js API",
    "env_vars": {
        "API_KEY": "xxx",
        "DATABASE_URL": "postgresql://..."
    },
    "custom_domain": "myapp.com"
}

Response:
{
    "success": true,
    "deployment_id": "abc123",
    "subdomain": "jh8gkq",
    "frontend_url": "http://jh8gkq.projectmarket.in",
    "backend_url": "http://jh8gkq-api.projectmarket.in",
    "status": "deploying"
}
```

#### GET /api/deployments
```json
Response:
[
    {
        "id": "abc123",
        "name": "My Portfolio",
        "subdomain": "jh8gkq",
        "status": "deployed",
        "created_at": "2026-02-14T10:00:00Z",
        "frontend_url": "http://jh8gkq.projectmarket.in"
    }
]
```

#### GET /api/deployment/:id/logs
```json
Response:
{
    "logs": [
        "📥 Cloning repository...",
        "🤖 ClawdBot analyzing project...",
        "📦 Installing dependencies...",
        "🚀 Starting application...",
        "✅ Deployment complete!"
    ],
    "status": "deployed"
}
```

### 5. ClawdBot Integration

**Remote Execution Strategy:**

```python
# Via SSH command
ssh_command = f"""
cd /root/.openclaw/workspace/server-dashboard
python3 << 'PYTHON_EOF'
import sys
sys.path.append('/root/.openclaw/workspace/server-dashboard')
from ai_deployer import ai_auto_deploy

result = ai_auto_deploy(
    repo_url='{repo_url}',
    port={port},
    domain='{domain}',
    app_name='{app_name}'
)

print('SUCCESS' if result.get('success') else 'FAILED')
print(result.get('error', ''))
PYTHON_EOF
"""
```

### 6. Port Management

**Find Free Port via SSH:**
```bash
# Execute via SSH
for port in {3100..8900}; do
    if ! lsof -i :$port > /dev/null 2>&1; then
        echo $port
        break
    fi
done
```

### 7. Nginx Configuration

**Create subdomain config via SSH:**
```bash
cat > /etc/nginx/sites-available/subdomain.projectmarket.in << 'EOF'
server {
    listen 80;
    server_name subdomain.projectmarket.in;
    location / {
        proxy_pass http://127.0.0.1:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/subdomain.projectmarket.in /etc/nginx/sites-enabled/
/usr/sbin/nginx -t && systemctl reload nginx
```

### 8. Real-time Log Streaming

**Options:**
- **WebSocket:** For real-time deployment logs
- **Server-Sent Events (SSE):** Simpler alternative
- **Polling:** Check status every 5 seconds

**Example (WebSocket):**
```javascript
// Server
io.on('connection', (socket) => {
    socket.on('deploy', async (data) => {
        const deploymentId = generateId();
        
        // Stream logs
        const logStream = (message) => {
            socket.emit('log', { deploymentId, message });
        };
        
        await deployWithClawdBot(data, logStream);
        
        socket.emit('complete', { deploymentId });
    });
});

// Client
const socket = io('ws://your-saas-backend:4000');
socket.emit('deploy', deploymentData);
socket.on('log', (data) => console.log(data.message));
socket.on('complete', () => console.log('Done!'));
```

### 9. User Dashboard Frontend (Optional)

**Tech Stack:**
- React or Vue.js
- TailwindCSS
- WebSocket for real-time updates

**Pages:**
- `/login` - Authentication
- `/dashboard` - Deployment list
- `/deploy` - New deployment form
- `/deployment/:id` - Details & logs
- `/settings` - User settings & API keys

### 10. Security Considerations

**Critical:**
- Store SSH credentials in environment variables
- Never expose SSH password in logs/responses
- Rate limit deployment requests
- Validate GitHub URLs
- Sanitize user inputs
- Use prepared statements for SQL
- Implement CORS properly
- Add API key authentication option

**Environment Variables:**
```env
SSH_HOST=160.250.204.184
SSH_USER=root
SSH_PASSWORD=your_password_here
DATABASE_URL=postgresql://user:pass@localhost/deploydb
JWT_SECRET=random_secret_key
PORT=4000
```

## Implementation Steps

### Step 1: Setup Project
```bash
ssh root@160.250.204.184
cd /root/.openclaw/workspace
mkdir deploy-saas
cd deploy-saas

# If Node.js:
npm init -y
npm install express jsonwebtoken bcryptjs node-ssh pg dotenv cors

# If Python:
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn paramiko psycopg2-binary python-jose passlib python-dotenv
```

### Step 2: Database Setup
```bash
# Install PostgreSQL if needed
apt install postgresql postgresql-contrib

# Create database
sudo -u postgres psql
CREATE DATABASE deploydb;
CREATE USER deployuser WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE deploydb TO deployuser;
\q

# Run schema.sql with table definitions
```

### Step 3: Build Core Modules
```
deploy-saas/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── ssh.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validation.js
│   ├── models/
│   │   ├── User.js
│   │   └── Deployment.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── deploy.js
│   │   └── user.js
│   ├── services/
│   │   ├── SSHManager.js
│   │   ├── ClawdBotService.js
│   │   ├── NginxManager.js
│   │   └── PortManager.js
│   └── app.js
├── .env
├── package.json
└── README.md
```

### Step 4: Test ClawdBot Integration
```javascript
// Test script
const SSHManager = require('./services/SSHManager');

async function test() {
    const ssh = new SSHManager();
    await ssh.connect();
    
    const result = await ssh.deployWithClawdBot(
        'https://github.com/facebook/create-react-app',
        3500,
        'test123.projectmarket.in',
        'test_deployment'
    );
    
    console.log('Result:', result);
}

test();
```

### Step 5: Deploy Backend
```bash
# Start with PM2
pm2 start src/app.js --name deploy-saas-backend
pm2 save

# Or Python
pm2 start "uvicorn main:app --host 0.0.0.0 --port 4000" --name deploy-saas-backend
pm2 save
```

### Step 6: Configure Nginx (Optional)
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
    }
}
```

## Key Functions to Implement

### 1. findFreePort()
```javascript
async findFreePort() {
    const result = await this.ssh.executeCommand(`
        for port in {3100..8900}; do
            if ! lsof -i :$port > /dev/null 2>&1; then
                echo $port
                break
            fi
        done
    `);
    return parseInt(result.stdout.trim());
}
```

### 2. generateSubdomain()
```javascript
function generateSubdomain() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length: 6}, () => 
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
}
```

### 3. createNginxConfig()
```javascript
async createNginxConfig(subdomain, port) {
    const config = `server {
        listen 80;
        server_name ${subdomain}.projectmarket.in;
        location / {
            proxy_pass http://127.0.0.1:${port};
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
        }
    }`;
    
    await this.ssh.executeCommand(`
        cat > /etc/nginx/sites-available/${subdomain}.projectmarket.in << 'EOF'
${config}
EOF
        ln -sf /etc/nginx/sites-available/${subdomain}.projectmarket.in /etc/nginx/sites-enabled/
        /usr/sbin/nginx -t && systemctl reload nginx
    `);
}
```

### 4. deployProject()
```javascript
async deployProject(userId, deploymentData) {
    // 1. Validate and save to DB
    const deployment = await Deployment.create({
        user_id: userId,
        ...deploymentData,
        status: 'deploying'
    });
    
    // 2. Generate subdomain and port
    const subdomain = generateSubdomain();
    const port = await this.findFreePort();
    
    // 3. Execute ClawdBot via SSH
    const appName = `user${userId}_${deployment.id}_frontend`;
    const result = await this.ssh.deployWithClawdBot(
        deploymentData.frontend_repo,
        port,
        `${subdomain}.projectmarket.in`,
        appName
    );
    
    // 4. Create nginx config
    await this.createNginxConfig(subdomain, port);
    
    // 5. Update database
    await deployment.update({
        subdomain,
        frontend_port: port,
        frontend_url: `http://${subdomain}.projectmarket.in`,
        status: 'deployed'
    });
    
    return deployment;
}
```

## Testing Checklist

- [ ] User can signup and login
- [ ] JWT authentication works
- [ ] SSH connection establishes
- [ ] ClawdBot deploys via SSH
- [ ] Subdomain gets created
- [ ] Nginx config generates
- [ ] PM2 process starts
- [ ] Logs stream to frontend
- [ ] Deployment accessible via URL
- [ ] User can view all deployments
- [ ] User can delete deployment
- [ ] Rate limiting works
- [ ] Error handling covers edge cases

## Deployment & Monitoring

```bash
# Check backend status
pm2 list
pm2 logs deploy-saas-backend

# Check database
psql -U deployuser -d deploydb
SELECT * FROM deployments;

# Check SSH connectivity
ssh root@160.250.204.184 "pm2 list"

# Monitor nginx
tail -f /var/log/nginx/error.log
```

## API Documentation

Generate with:
- **Swagger/OpenAPI** for REST API
- **Postman Collection** for testing
- **README.md** with examples

## Success Criteria

✅ External users can signup
✅ Users can deploy via API
✅ ClawdBot deploys projects remotely
✅ Subdomains work automatically
✅ Logs stream in real-time
✅ Multiple users can deploy simultaneously
✅ SSH connection is stable
✅ Error handling is robust
✅ API is documented

## Final Architecture

```
User → SaaS Backend API (Port 4000)
         ↓ SSH
         ↓
    Deployment Server (160.250.204.184)
         ↓
    ClawdBot AI Deployer
         ↓
    PM2 + Nginx
         ↓
    Live at subdomain.projectmarket.in
```

---

## Start Building Now!

1. SSH into server
2. Create `/root/.openclaw/workspace/deploy-saas/`
3. Initialize project
4. Implement SSH manager
5. Connect to ClawdBot
6. Build API endpoints
7. Test deployment flow
8. Deploy backend
9. Create frontend (optional)
10. Document everything

**Good luck! You're building a production-ready deployment SaaS!** 🚀
