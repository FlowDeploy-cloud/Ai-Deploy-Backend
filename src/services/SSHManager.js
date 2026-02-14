const { NodeSSH } = require('node-ssh');
require('dotenv').config();

class SSHManager {
    constructor() {
        this.ssh = new NodeSSH();
        this.connected = false;
        this.config = {
            host: process.env.SSH_HOST,
            username: process.env.SSH_USER,
            password: process.env.SSH_PASSWORD,
            port: parseInt(process.env.SSH_PORT || '22'),
            readyTimeout: 30000,
            keepaliveInterval: 10000
        };
    }

    async connect() {
        if (this.connected) {
            return true;
        }

        try {
            await this.ssh.connect(this.config);
            this.connected = true;
            console.log('✅ SSH connection established');
            return true;
        } catch (error) {
            console.error('❌ SSH connection failed:', error.message);
            this.connected = false;
            throw new Error('SSH connection failed: ' + error.message);
        }
    }

    async disconnect() {
        if (this.connected) {
            this.ssh.dispose();
            this.connected = false;
            console.log('🔌 SSH connection closed');
        }
    }

    async ensureConnection() {
        if (!this.connected) {
            await this.connect();
        }
    }

    async executeCommand(command, options = {}) {
        await this.ensureConnection();

        try {
            const result = await this.ssh.execCommand(command, {
                cwd: options.cwd || '/root',
                execOptions: {
                    pty: options.pty || false
                },
                ...options
            });

            return {
                stdout: result.stdout,
                stderr: result.stderr,
                code: result.code,
                success: result.code === 0
            };
        } catch (error) {
            console.error('Command execution error:', error.message);
            throw new Error('Command execution failed: ' + error.message);
        }
    }

    async deployWithClawdBot(repoUrl, port, domain, appName) {
        await this.ensureConnection();

        const command = `cd /root/.openclaw/workspace/server-dashboard && python3 << 'PYTHON_EOF'
import sys
sys.path.append('/root/.openclaw/workspace/server-dashboard')
from ai_deployer import ai_auto_deploy

try:
    result = ai_auto_deploy(
        repo_url='${repoUrl}',
        port=${port},
        domain='${domain}',
        app_name='${appName}'
    )
    
    if result.get('success'):
        print('SUCCESS')
        print(result.get('message', 'Deployment completed'))
    else:
        print('FAILED')
        print(result.get('error', 'Unknown error'))
except Exception as e:
    print('FAILED')
    print(str(e))
PYTHON_EOF
`;

        const result = await this.executeCommand(command);
        
        const lines = result.stdout.split('\n');
        const status = lines[0]?.trim();
        const message = lines.slice(1).join('\n').trim();

        return {
            success: status === 'SUCCESS',
            message: message || result.stdout,
            error: status === 'FAILED' ? message : result.stderr,
            raw: result
        };
    }

    async findFreePort() {
        await this.ensureConnection();

        const minPort = process.env.MIN_PORT || 3100;
        const maxPort = process.env.MAX_PORT || 8900;

        const command = `for port in {${minPort}..${maxPort}}; do
    if ! lsof -i :$port > /dev/null 2>&1; then
        echo $port
        break
    fi
done`;

        const result = await this.executeCommand(command);
        
        if (result.success && result.stdout.trim()) {
            return parseInt(result.stdout.trim());
        }
        
        throw new Error('No free port available');
    }

    async checkPortInUse(port) {
        await this.ensureConnection();

        const command = `lsof -i :${port} > /dev/null 2>&1 && echo "IN_USE" || echo "FREE"`;
        const result = await this.executeCommand(command);
        
        return result.stdout.trim() === 'IN_USE';
    }

    async getPM2Processes() {
        await this.ensureConnection();

        const command = 'pm2 jlist';
        const result = await this.executeCommand(command);
        
        if (result.success) {
            try {
                return JSON.parse(result.stdout);
            } catch (e) {
                return [];
            }
        }
        
        return [];
    }

    async stopPM2Process(processName) {
        await this.ensureConnection();

        const command = `pm2 stop ${processName}`;
        const result = await this.executeCommand(command);
        
        return result.success;
    }

    async restartPM2Process(processName) {
        await this.ensureConnection();

        const command = `pm2 restart ${processName}`;
        const result = await this.executeCommand(command);
        
        return result.success;
    }

    async deletePM2Process(processName) {
        await this.ensureConnection();

        // First, get the working directory from PM2
        const cwdCommand = `pm2 jlist | jq -r '.[] | select(.name=="${processName}") | .pm2_env.pm_cwd'`;
        const cwdResult = await this.executeCommand(cwdCommand);
        const workingDir = cwdResult.stdout?.trim();

        // Delete the PM2 process
        const command = `pm2 delete ${processName}`;
        const result = await this.executeCommand(command);
        
        // If successful and we have a working directory, delete the project files
        if (result.success && workingDir && workingDir !== 'null' && workingDir !== '') {
            console.log(`[SSH] Deleting project directory: ${workingDir}`);
            try {
                // Remove the project directory completely
                const rmCommand = `rm -rf ${workingDir}`;
                const rmResult = await this.executeCommand(rmCommand);
                
                if (rmResult.success) {
                    console.log(`[SSH] Successfully deleted project directory: ${workingDir}`);
                } else {
                    console.error(`[SSH] Failed to delete directory: ${rmResult.stderr}`);
                }
            } catch (error) {
                console.error(`[SSH] Error deleting directory:`, error);
            }
        }
        
        return result.success;
    }

    async deleteProjectDirectory(appName) {
        await this.ensureConnection();

        // Get the working directory from PM2
        const cwdCommand = `pm2 jlist | jq -r '.[] | select(.name=="${appName}") | .pm2_env.pm_cwd'`;
        const cwdResult = await this.executeCommand(cwdCommand);
        const workingDir = cwdResult.stdout?.trim();

        if (!workingDir || workingDir === 'null' || workingDir === '') {
            console.log(`[SSH] No working directory found for ${appName}`);
            return false;
        }

        console.log(`[SSH] Deleting project directory: ${workingDir}`);
        const command = `rm -rf ${workingDir}`;
        const result = await this.executeCommand(command);

        return result.success;
    }

    async getPM2Logs(processName, lines = 100) {
        await this.ensureConnection();

        const command = `pm2 logs ${processName} --lines ${lines} --nostream`;
        const result = await this.executeCommand(command);
        
        return result.stdout;
    }

    async fileExists(path) {
        await this.ensureConnection();

        const command = `test -f ${path} && echo "EXISTS" || echo "NOT_EXISTS"`;
        const result = await this.executeCommand(command);
        
        return result.stdout.trim() === 'EXISTS';
    }

    async directoryExists(path) {
        await this.ensureConnection();

        const command = `test -d ${path} && echo "EXISTS" || echo "NOT_EXISTS"`;
        const result = await this.executeCommand(command);
        
        return result.stdout.trim() === 'EXISTS';
    }

    async createDirectory(path) {
        await this.ensureConnection();

        const command = `mkdir -p ${path}`;
        const result = await this.executeCommand(command);
        
        return result.success;
    }

    async deleteDirectory(path) {
        await this.ensureConnection();

        const command = `rm -rf ${path}`;
        const result = await this.executeCommand(command);
        
        return result.success;
    }

    async writeFile(path, content) {
        await this.ensureConnection();

        const command = `cat > ${path} << 'EOF'\n${content}\nEOF`;
        const result = await this.executeCommand(command);
        
        return result.success;
    }

    async readFile(path) {
        await this.ensureConnection();

        const command = `cat ${path}`;
        const result = await this.executeCommand(command);
        
        if (result.success) {
            return result.stdout;
        }
        
        throw new Error('Failed to read file: ' + result.stderr);
    }
}

// Singleton instance
let sshInstance = null;

function getSSHManager() {
    if (!sshInstance) {
        sshInstance = new SSHManager();
    }
    return sshInstance;
}

module.exports = { SSHManager, getSSHManager };
