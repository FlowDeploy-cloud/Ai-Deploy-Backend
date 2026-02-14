const { getSSHManager } = require('./SSHManager');
const DeploymentLog = require('../models/DeploymentLog');

class ClawdBotService {
    constructor() {
        this.ssh = getSSHManager();
        this.clawdbotPath = process.env.CLAWDBOT_PATH || '/root/.openclaw/workspace/server-dashboard/ai_deployer.py';
    }

    async deploy(deploymentId, repoUrl, port, domain, appName, onLog) {
        const logMessage = (message, type = 'info') => {
            console.log(`[${type.toUpperCase()}] ${message}`);
            if (onLog) onLog(message, type);
            if (deploymentId) {
                DeploymentLog.create(deploymentId, message, type).catch(console.error);
            }
        };

        try {
            logMessage('🚀 Starting deployment with ClawdBot AI...', 'info');
            logMessage(`📦 Repository: ${repoUrl}`, 'info');
            logMessage(`🔌 Port: ${port}`, 'info');
            logMessage(`🌐 Domain: ${domain}`, 'info');

            // Ensure SSH connection
            await this.ssh.ensureConnection();
            logMessage('✅ SSH connection established', 'success');

            // Build Python command
            const pythonCommand = `cd ${this.clawdbotPath.replace('/ai_deployer.py', '')} && python3 << 'PYTHON_EOF'
import sys
import os
import json
sys.path.append('${this.clawdbotPath.replace('/ai_deployer.py', '')}')
from ai_deployer import ai_auto_deploy

try:
    result = ai_auto_deploy(
        repo_url='${repoUrl}',
        port=${port},
        domain='${domain}',
        app_name='${appName}'
    )
    
    if isinstance(result, dict):
        if result.get('success'):
            print('SUCCESS')
            # Output deployment details as JSON
            details = {
                'message': result.get('message', 'Deployment completed successfully'),
                'actual_port': result.get('port', ${port}),
                'app_name': '${appName}',
                'domain': '${domain}'
            }
            print(json.dumps(details))
        else:
            print('FAILED')
            print(result.get('error', 'Deployment failed'))
    else:
        print('SUCCESS')
        details = {
            'message': 'Deployment completed',
            'actual_port': ${port},
            'app_name': '${appName}',
            'domain': '${domain}'
        }
        print(json.dumps(details))
        
except Exception as e:
    print('FAILED')
    print(f'Error: {str(e)}')
PYTHON_EOF
`;

            logMessage('🤖 ClawdBot is analyzing the repository...', 'info');

            // Execute deployment
            const result = await this.ssh.executeCommand(pythonCommand, {
                cwd: this.clawdbotPath.replace('/ai_deployer.py', '')
            });

            // Log raw output for debugging
            console.log('=== ClawdBot Raw Output ===');
            console.log('STDOUT:', result.stdout);
            console.log('STDERR:', result.stderr);
            console.log('CODE:', result.code);
            console.log('===========================');

            const lines = result.stdout.split('\n');
            const status = lines[0]?.trim();
            const message = lines.slice(1).join('\n').trim();

            // Check if there's any error in stderr
            if (result.stderr && result.stderr.trim()) {
                logMessage(`⚠️ ClawdBot warnings: ${result.stderr}`, 'warning');
            }

            if (status === 'SUCCESS') {
                logMessage('✅ ClawdBot deployment successful!', 'success');
                
                // Try to parse deployment details
                let deploymentDetails = {
                    message: message,
                    actual_port: port,
                    app_name: appName,
                    domain: domain
                };
                
                try {
                    // Try to parse JSON details
                    const jsonMatch = message.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        deploymentDetails = JSON.parse(jsonMatch[0]);
                        logMessage(`📊 Deployment details: ${JSON.stringify(deploymentDetails)}`, 'info');
                    }
                } catch (e) {
                    // If not JSON, use the message as is
                    logMessage(message || 'Application deployed and running', 'info');
                }
                
                const configuredPort = deploymentDetails.actual_port || port;
                logMessage(`🔌 Application configured for port: ${configuredPort}`, 'info');
                
                // CRITICAL: Wait 8 seconds for app to fully start and begin listening
                logMessage('⏳ Waiting 8 seconds for application to start listening...', 'info');
                await new Promise(resolve => setTimeout(resolve, 8000));
                
                // DETECT ACTUAL PORT using 3-method detection system
                logMessage('🔍 Detecting actual listening port...', 'info');
                const actualPort = await this.detectActualPort(appName, logMessage);
                
                if (!actualPort) {
                    logMessage('❌ Failed to detect actual listening port - app may not have started', 'error');
                    return {
                        success: false,
                        error: 'Failed to detect application listening port',
                        appName: appName,
                        allocatedPort: port,
                        actualPort: null,
                        domain: domain
                    };
                }
                
                // Log if port differs from allocated port
                if (actualPort !== port) {
                    logMessage(`⚠️ PORT MISMATCH DETECTED!`, 'warning');
                    logMessage(`   Allocated Port: ${port}`, 'warning');
                    logMessage(`   Actual Port: ${actualPort}`, 'warning');
                    logMessage(`   This is normal for Vite apps (they scan for free ports)`, 'info');
                }
                
                // Verify deployment on actual port
                logMessage(`🔍 Verifying deployment on actual port ${actualPort}...`, 'info');
                const verificationResult = await this.verifyDeployment(appName, actualPort, logMessage);
                
                if (!verificationResult.success) {
                    logMessage(`⚠️ Verification failed: ${verificationResult.error}`, 'warning');
                    return {
                        success: false,
                        error: `Deployment verification failed: ${verificationResult.error}`,
                        appName: appName,
                        allocatedPort: port,
                        actualPort: actualPort,
                        domain: domain
                    };
                }
                
                logMessage(`✅ Deployment verified successfully on port ${actualPort}!`, 'success');
                
                return {
                    success: true,
                    message: deploymentDetails.message || 'Deployment completed successfully',
                    appName: appName,
                    allocatedPort: port,           // Port we tried to allocate
                    actualPort: actualPort,         // Port app is actually listening on
                    port: actualPort,               // For backwards compatibility
                    portChanged: actualPort !== port,
                    domain: domain
                };
            } else {
                logMessage(`❌ ClawdBot deployment failed: ${message}`, 'error');
                logMessage(result.stderr, 'error');
                
                return {
                    success: false,
                    error: message || 'Deployment failed',
                    stderr: result.stderr
                };
            }

        } catch (error) {
            logMessage(`❌ Deployment error: ${error.message}`, 'error');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async detectActualPort(appName, logMessage) {
        try {
            logMessage('🔍 Detecting actual listening port using 3-method detection system...', 'info');
            
            // METHOD 1: lsof - Most reliable (checks actual listening ports)
            logMessage('Method 1: Checking actual listening ports via lsof...', 'info');
            try {
                const pidResult = await this.ssh.executeCommand(`pm2 jlist | jq -r '.[] | select(.name=="${appName}") | .pid'`);
                if (pidResult.success && pidResult.stdout.trim() && pidResult.stdout.trim() !== 'null') {
                    const pid = pidResult.stdout.trim();
                    logMessage(`Found PID: ${pid}`, 'info');
                    
                    // Use lsof to find all listening ports for this PID
                    const lsofResult = await this.ssh.executeCommand(`lsof -Pan -p ${pid} -i | grep LISTEN | awk '{print $9}' | cut -d: -f2 | sort -u`);
                    
                    if (lsofResult.success && lsofResult.stdout.trim()) {
                        const ports = lsofResult.stdout.split('\n')
                            .map(p => parseInt(p.trim()))
                            .filter(p => !isNaN(p) && p >= 3000 && p <= 9000);
                        
                        if (ports.length > 0) {
                            const actualPort = ports[0];
                            logMessage(`✅ Method 1 SUCCESS: Process is listening on port ${actualPort}`, 'success');
                            logMessage(`All listening ports: ${ports.join(', ')}`, 'info');
                            return actualPort;
                        }
                    }
                }
                logMessage('⚠️ Method 1 FAILED: No listening ports found via lsof', 'warning');
            } catch (error) {
                logMessage(`⚠️ Method 1 ERROR: ${error.message}`, 'warning');
            }
            
            // METHOD 2: PM2 Logs - Parse application output
            logMessage('Method 2: Scanning PM2 logs for port patterns...', 'info');
            try {
                const logsResult = await this.ssh.executeCommand(`pm2 logs ${appName} --lines 100 --nostream`);
                
                if (logsResult.success && logsResult.stdout) {
                    // Comprehensive port patterns (from most specific to general)
                    const portPatterns = [
                        /Local:\s+https?:\/\/[^:]+:(\d+)/i,           // Vite: Local: http://localhost:5173
                        /listening on.*?http:\/\/.*?:(\d+)/i,         // "listening on http://localhost:3000"
                        /server running (?:at|on).*?:(\d+)/i,         // "server running at :3000"
                        /listening on (?:port )?:(\d+)/i,             // "listening on :3000"
                        /server (?:started|listening) on port (\d+)/i, // "server started on port 3000"
                        /running on port (\d+)/i,                     // "running on port 3000"
                        /started (?:at|on) port (\d+)/i,              // "started at port 3000"
                        /listening at .*?:(\d+)/i,                    // "listening at 0.0.0.0:3000"
                        /PORT[=:\s]+(\d+)/i,                          // "PORT=3000" or "PORT: 3000"
                        /App listening on (\d+)/i                     // "App listening on 3000"
                    ];
                    
                    for (const pattern of portPatterns) {
                        const match = logsResult.stdout.match(pattern);
                        if (match && match[1]) {
                            const detectedPort = parseInt(match[1]);
                            if (detectedPort >= 3000 && detectedPort <= 9000) {
                                logMessage(`✅ Method 2 SUCCESS: Found port ${detectedPort} in logs (pattern: ${pattern.source})`, 'success');
                                return detectedPort;
                            }
                        }
                    }
                }
                logMessage('⚠️ Method 2 FAILED: No valid port patterns found in logs', 'warning');
            } catch (error) {
                logMessage(`⚠️ Method 2 ERROR: ${error.message}`, 'warning');
            }
            
            // METHOD 3: PM2 Environment Variables
            logMessage('Method 3: Checking PM2 environment PORT variable...', 'info');
            try {
                const pm2EnvResult = await this.ssh.executeCommand(`pm2 jlist | jq -r '.[] | select(.name=="${appName}") | .pm2_env.env.PORT // .pm2_env.PORT // empty'`);
                if (pm2EnvResult.success && pm2EnvResult.stdout.trim() && pm2EnvResult.stdout.trim() !== 'null') {
                    const envPort = parseInt(pm2EnvResult.stdout.trim());
                    if (!isNaN(envPort) && envPort >= 3000 && envPort <= 9000) {
                        logMessage(`✅ Method 3 SUCCESS: Found port ${envPort} in environment`, 'success');
                        return envPort;
                    }
                }
                logMessage('⚠️ Method 3 FAILED: No valid PORT in environment', 'warning');
            } catch (error) {
                logMessage(`⚠️ Method 3 ERROR: ${error.message}`, 'warning');
            }
            
            // All methods failed
            logMessage('❌ All 3 detection methods failed - port detection unsuccessful', 'error');
            return null;
            
        } catch (error) {
            logMessage(`❌ Critical error in port detection: ${error.message}`, 'error');
            console.error('Error detecting actual port:', error.message);
            return null;
        }
    }

    async verifyDeployment(appName, port, logMessage) {
        try {
            // Check if PM2 process exists and is running
            logMessage(`🔍 Checking PM2 process: ${appName}`, 'info');
            const processes = await this.ssh.getPM2Processes();
            const process = processes.find(p => p.name === appName);
            
            if (!process) {
                return {
                    success: false,
                    error: `PM2 process "${appName}" not found`
                };
            }
            
            if (process.pm2_env.status !== 'online') {
                return {
                    success: false,
                    error: `PM2 process is ${process.pm2_env.status}, not online`
                };
            }
            
            logMessage(`✅ PM2 process is running (${process.pm2_env.status})`, 'success');
            
            // Check if port is in use (meaning app is listening)
            logMessage(`🔍 Checking if port ${port} is active`, 'info');
            const portInUse = await this.ssh.checkPortInUse(port);
            
            if (!portInUse) {
                return {
                    success: false,
                    error: `Port ${port} is not in use - application may not be listening`
                };
            }
            
            logMessage(`✅ Port ${port} is active and responding`, 'success');
            
            return {
                success: true,
                status: process.pm2_env.status,
                uptime: process.pm2_env.pm_uptime,
                memory: process.monit.memory,
                cpu: process.monit.cpu
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Verification error: ${error.message}`
            };
        }
    }

    async checkDeploymentStatus(appName) {
        try {
            const processes = await this.ssh.getPM2Processes();
            const process = processes.find(p => p.name === appName);
            
            if (!process) {
                return { running: false, status: 'not_found' };
            }
            
            return {
                running: process.pm2_env.status === 'online',
                status: process.pm2_env.status,
                uptime: process.pm2_env.pm_uptime,
                restarts: process.pm2_env.restart_time,
                memory: process.monit.memory,
                cpu: process.monit.cpu
            };
            
        } catch (error) {
            console.error('Failed to check deployment status:', error.message);
            return { running: false, error: error.message };
        }
    }

    async stopDeployment(appName, deploymentId) {
        try {
            const logMessage = async (message, type = 'info') => {
                console.log(`[${type.toUpperCase()}] ${message}`);
                if (deploymentId) {
                    await DeploymentLog.create(deploymentId, message, type);
                }
            };

            await logMessage(`🛑 Stopping ${appName}...`, 'info');
            
            const result = await this.ssh.stopPM2Process(appName);
            
            if (result) {
                await logMessage(`✅ ${appName} stopped successfully`, 'success');
                return { success: true };
            } else {
                await logMessage(`❌ Failed to stop ${appName}`, 'error');
                return { success: false, error: 'Failed to stop process' };
            }
            
        } catch (error) {
            console.error('Failed to stop deployment:', error.message);
            return { success: false, error: error.message };
        }
    }

    async restartDeployment(appName, deploymentId) {
        try {
            const logMessage = async (message, type = 'info') => {
                console.log(`[${type.toUpperCase()}] ${message}`);
                if (deploymentId) {
                    await DeploymentLog.create(deploymentId, message, type);
                }
            };

            await logMessage(`🔄 Restarting ${appName}...`, 'info');
            
            const result = await this.ssh.restartPM2Process(appName);
            
            if (result) {
                await logMessage(`✅ ${appName} restarted successfully`, 'success');
                return { success: true };
            } else {
                await logMessage(`❌ Failed to restart ${appName}`, 'error');
                return { success: false, error: 'Failed to restart process' };
            }
            
        } catch (error) {
            console.error('Failed to restart deployment:', error.message);
            return { success: false, error: error.message };
        }
    }

    async deleteDeployment(appName, deploymentId) {
        try {
            const logMessage = async (message, type = 'info') => {
                console.log(`[${type.toUpperCase()}] ${message}`);
                if (deploymentId) {
                    await DeploymentLog.create(deploymentId, message, type);
                }
            };

            await logMessage(`🗑️ Deleting ${appName}...`, 'info');
            
            const result = await this.ssh.deletePM2Process(appName);
            
            if (result) {
                await logMessage(`✅ ${appName} deleted successfully`, 'success');
                return { success: true };
            } else {
                await logMessage(`❌ Failed to delete ${appName}`, 'error');
                return { success: false, error: 'Failed to delete process' };
            }
            
        } catch (error) {
            console.error('Failed to delete deployment:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getLogs(appName, lines = 100) {
        try {
            const logs = await this.ssh.getPM2Logs(appName, lines);
            return { success: true, logs };
        } catch (error) {
            console.error('Failed to get logs:', error.message);
            return { success: false, error: error.message, logs: '' };
        }
    }
}

module.exports = ClawdBotService;
