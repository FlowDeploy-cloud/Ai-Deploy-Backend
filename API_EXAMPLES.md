# ClawDeploy API Test Examples

## Setup

```bash
export API_URL="http://localhost:4000/api"
# Or for deployed version:
# export API_URL="http://160.250.204.184:4000/api"
```

## 1. Health Check

```bash
curl http://localhost:4000/health
```

## 2. User Registration

```bash
curl -X POST $API_URL/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123",
    "plan": "free"
  }'
```

Response:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com",
      "plan": "free",
      "max_deployments": 5,
      "api_key": "abc123..."
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Save the token:**
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIs..."
export API_KEY="abc123..."
```

## 3. User Login

```bash
curl -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

## 4. Get User Profile

```bash
# Using Bearer Token
curl $API_URL/auth/profile \
  -H "Authorization: Bearer $TOKEN"

# Using API Key
curl $API_URL/auth/profile \
  -H "X-API-Key: $API_KEY"
```

## 5. Get User Stats

```bash
curl $API_URL/user/stats \
  -H "Authorization: Bearer $TOKEN"
```

## 6. Create Deployment (Frontend Only)

```bash
curl -X POST $API_URL/deployments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Portfolio",
    "frontend_repo": "https://github.com/facebook/create-react-app",
    "frontend_description": "React portfolio website with modern design"
  }'
```

## 7. Create Deployment (Frontend + Backend)

```bash
curl -X POST $API_URL/deployments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Full Stack E-commerce",
    "frontend_repo": "https://github.com/user/ecommerce-frontend",
    "backend_repo": "https://github.com/user/ecommerce-backend",
    "frontend_description": "React e-commerce storefront",
    "backend_description": "Node.js REST API with Express",
    "env_vars": {
      "API_URL": "http://subdomain-api.projectmarket.in",
      "MONGODB_URI": "mongodb://localhost:27017/ecommerce",
      "JWT_SECRET": "mysecret"
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Deployment started",
  "data": {
    "status": "deploying",
    "message": "Your deployment is in progress. Check deployment logs for updates."
  }
}
```

## 8. List All Deployments

```bash
curl $API_URL/deployments \
  -H "Authorization: Bearer $TOKEN"
```

## 9. Get Specific Deployment

```bash
# Replace DEPLOYMENT_ID with actual ID
curl $API_URL/deployments/DEPLOYMENT_ID \
  -H "Authorization: Bearer $TOKEN"
```

## 10. Get Deployment Logs

```bash
curl "$API_URL/deployments/DEPLOYMENT_ID/logs?lines=50" \
  -H "Authorization: Bearer $TOKEN"
```

## 11. Get PM2 Logs

```bash
# Frontend logs
curl "$API_URL/deployments/DEPLOYMENT_ID/pm2-logs?target=frontend&lines=100" \
  -H "Authorization: Bearer $TOKEN"

# Backend logs
curl "$API_URL/deployments/DEPLOYMENT_ID/pm2-logs?target=backend&lines=100" \
  -H "Authorization: Bearer $TOKEN"
```

## 12. Stop Deployment

```bash
curl -X POST $API_URL/deployments/DEPLOYMENT_ID/stop \
  -H "Authorization: Bearer $TOKEN"
```

## 13. Restart Deployment

```bash
curl -X POST $API_URL/deployments/DEPLOYMENT_ID/restart \
  -H "Authorization: Bearer $TOKEN"
```

## 14. Delete Deployment

```bash
curl -X DELETE $API_URL/deployments/DEPLOYMENT_ID \
  -H "Authorization: Bearer $TOKEN"
```

## 15. Regenerate API Key

```bash
curl -X POST $API_URL/auth/regenerate-api-key \
  -H "Authorization: Bearer $TOKEN"
```

## 16. Change Password

```bash
curl -X POST $API_URL/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "SecurePass123",
    "new_password": "NewSecurePass456"
  }'
```

## 17. Update User Plan

```bash
curl -X POST $API_URL/user/plan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "pro"
  }'
```

## WebSocket Example (JavaScript)

```javascript
// Install: npm install socket.io-client

const io = require('socket.io-client');

const socket = io('http://localhost:4000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});

// Connection events
socket.on('connect', () => {
  console.log('✅ Connected to server');
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from server');
});

// Deployment events
socket.on('log', (data) => {
  console.log(`[${data.type}] ${data.message}`);
});

socket.on('deployment_complete', (data) => {
  console.log('🎉 Deployment successful!');
  console.log('Frontend URL:', data.deployment.frontend_url);
  console.log('Backend URL:', data.deployment.backend_url);
});

socket.on('deployment_failed', (data) => {
  console.error('❌ Deployment failed:', data.error);
});

// Trigger deployment
socket.emit('deploy', {
  name: 'My App',
  frontend_repo: 'https://github.com/user/app',
  frontend_description: 'React application'
});
```

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email address"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Access token required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Access denied"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Deployment not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

## Rate Limiting

- **Window:** 15 minutes
- **Max Requests:** 100 per window
- **Applies to:** All /api/* endpoints

## Plans & Limits

| Plan | Max Deployments | Price |
|------|----------------|-------|
| Free | 5 | $0 |
| Pro | 50 | TBD |
| Enterprise | 999 | TBD |
