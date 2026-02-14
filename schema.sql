-- Create database and user (run as postgres superuser)
-- CREATE DATABASE deploydb;
-- CREATE USER deployuser WITH PASSWORD 'secure_password';
-- GRANT ALL PRIVILEGES ON DATABASE deploydb TO deployuser;

-- Connect to deploydb before running below
-- \c deploydb

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE,
    plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    max_deployments INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deployment_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
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
    env_vars JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'deploying' CHECK (status IN ('deploying', 'deployed', 'failed', 'stopped')),
    pm2_frontend_name VARCHAR(100),
    pm2_backend_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deployment logs table
CREATE TABLE IF NOT EXISTS deployment_logs (
    id SERIAL PRIMARY KEY,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    log_type VARCHAR(20) DEFAULT 'info' CHECK (log_type IN ('info', 'error', 'success', 'warning')),
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deployments_user_id ON deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment_id ON deployment_logs(deployment_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deployments_updated_at BEFORE UPDATE ON deployments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
