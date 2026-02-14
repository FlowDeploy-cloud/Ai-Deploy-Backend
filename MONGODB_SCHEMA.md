# MongoDB Schema for ClawDeploy

MongoDB is a NoSQL database that doesn't require explicit schema creation. Schemas are defined in Mongoose models.

## Collections

### 1. Users Collection

```javascript
{
  _id: ObjectId,
  username: String (unique, required),
  email: String (unique, required),
  password_hash: String (required),
  api_key: String (unique),
  plan: String (enum: ['free', 'pro', 'enterprise']),
  max_deployments: Number,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `email` (unique)
- `username` (unique)
- `api_key` (unique)

### 2. Deployments Collection

```javascript
{
  _id: ObjectId,
  user_id: ObjectId (ref: User),
  deployment_id: String (unique),
  name: String (required),
  subdomain: String (unique, required),
  frontend_repo: String,
  backend_repo: String,
  frontend_description: String,
  backend_description: String,
  frontend_port: Number,
  backend_port: Number,
  frontend_url: String,
  backend_url: String,
  custom_domain: String,
  env_vars: Map<String, String>,
  status: String (enum: ['deploying', 'deployed', 'failed', 'stopped']),
  pm2_frontend_name: String,
  pm2_backend_name: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `user_id`
- `deployment_id` (unique)
- `subdomain` (unique)
- `status`

### 3. DeploymentLogs Collection

```javascript
{
  _id: ObjectId,
  deployment_id: ObjectId (ref: Deployment),
  message: String (required),
  log_type: String (enum: ['info', 'error', 'success', 'warning']),
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `deployment_id` + `createdAt` (compound)

## Setup Instructions

### Option 1: Local MongoDB

1. **Install MongoDB:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install -y mongodb
   
   # Or MongoDB Community Edition
   wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
   echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
   sudo apt-get update
   sudo apt-get install -y mongodb-org
   
   # Start MongoDB
   sudo systemctl start mongod
   sudo systemctl enable mongod
   ```

2. **Verify Installation:**
   ```bash
   mongosh
   ```

3. **Update .env:**
   ```env
   MONGODB_URI=mongodb://localhost:27017/clawdeploy
   ```

4. **Run Setup:**
   ```bash
   npm run setup-db
   ```

### Option 2: MongoDB Atlas (Cloud)

1. **Create Account:**
   - Go to https://www.mongodb.com/cloud/atlas
   - Sign up for free account

2. **Create Cluster:**
   - Click "Build a Database"
   - Choose "Free" tier (M0)
   - Select region closest to you
   - Click "Create Cluster"

3. **Create Database User:**
   - Go to "Database Access"
   - Add new user with username/password
   - Grant "Read and write to any database"

4. **Whitelist IP:**
   - Go to "Network Access"
   - Add IP Address
   - Enter `0.0.0.0/0` for all IPs (or specific IP)

5. **Get Connection String:**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy connection string
   - Replace `<password>` with your database user password

6. **Update .env:**
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/clawdeploy
   ```

7. **Run Setup:**
   ```bash
   npm run setup-db
   ```

## Migration from PostgreSQL

If you had PostgreSQL data, here's how to migrate:

### Manual Migration

1. **Export PostgreSQL Data:**
   ```bash
   pg_dump -U deployuser -d deploydb -F c -f backup.dump
   ```

2. **Convert to JSON:**
   ```bash
   psql -U deployuser -d deploydb -c "COPY (SELECT row_to_json(users) FROM users) TO STDOUT" > users.json
   psql -U deployuser -d deploydb -c "COPY (SELECT row_to_json(deployments) FROM deployments) TO STDOUT" > deployments.json
   ```

3. **Import to MongoDB:**
   ```bash
   mongoimport --uri="mongodb://localhost:27017/clawdeploy" --collection=users --file=users.json
   mongoimport --uri="mongodb://localhost:27017/clawdeploy" --collection=deployments --file=deployments.json
   ```

### Using Migration Script

Create `migrate.js`:

```javascript
const { Pool } = require('pg');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Deployment = require('./src/models/Deployment');

async function migrate() {
    // Connect to PostgreSQL
    const pgPool = new Pool({
        connectionString: 'postgresql://deployuser:password@localhost:5432/deploydb'
    });
    
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/clawdeploy');
    
    // Migrate users
    const users = await pgPool.query('SELECT * FROM users');
    for (const user of users.rows) {
        await User.create({
            username: user.username,
            email: user.email,
            password_hash: user.password_hash,
            api_key: user.api_key,
            plan: user.plan,
            max_deployments: user.max_deployments
        });
    }
    
    // Migrate deployments (similar pattern)
    
    console.log('Migration complete!');
    process.exit(0);
}

migrate();
```

## Database Operations

### Create Admin User
```bash
npm run setup-db
```

### Drop Database (DANGER!)
```bash
mongosh
use clawdeploy
db.dropDatabase()
```

### View Collections
```bash
mongosh clawdeploy
show collections
db.users.find().pretty()
db.deployments.find().pretty()
```

### Backup Database
```bash
mongodump --uri="mongodb://localhost:27017/clawdeploy" --out=backup/
```

### Restore Database
```bash
mongorestore --uri="mongodb://localhost:27017/clawdeploy" backup/clawdeploy/
```

## Performance Tips

1. **Indexes are automatically created** by Mongoose based on schema definitions

2. **Connection Pooling** is handled by Mongoose (default: 5 connections)

3. **For Production:**
   ```javascript
   mongoose.connect(uri, {
       maxPoolSize: 10,
       serverSelectionTimeoutMS: 5000,
       socketTimeoutMS: 45000,
   });
   ```

## Monitoring

### MongoDB Compass (GUI)
Download: https://www.mongodb.com/products/compass

### Command Line
```bash
mongosh
use clawdeploy
db.stats()
db.users.stats()
db.deployments.stats()
```

## Troubleshooting

### Can't connect to MongoDB
```bash
# Check if running
sudo systemctl status mongod

# Check logs
sudo tail -f /var/log/mongodb/mongod.log

# Restart
sudo systemctl restart mongod
```

### "MongoServerError: command find requires authentication"
Create user with proper permissions:
```bash
mongosh
use admin
db.createUser({
  user: "clawdeploy",
  pwd: "your_password",
  roles: ["readWriteAnyDatabase"]
})
```

Then update MONGODB_URI:
```env
MONGODB_URI=mongodb://clawdeploy:your_password@localhost:27017/clawdeploy?authSource=admin
```
