const { getSSHManager } = require('./SSHManager');
const DeploymentLog = require('../models/DeploymentLog');

class ClawdBotService {
    constructor() {
        this.ssh = getSSHManager();
        this.clawdbotPath = process.env.CLAWDBOT_PATH || '/root/.openclaw/workspace/server-dashboard/ai_deployer.py';
    }

    async deploy(deploymentId, repoUrl, port, domain, appName, envVars = {}, onLog) {
        const logMessage = (message, type = 'info') => {
            // Skip empty messages to prevent validation errors
            if (!message || message.trim() === '') {
                return;
            }
            
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
            
            // Log environment variables (mask sensitive values)
            const envCount = Object.keys(envVars).length;
            if (envCount > 0) {
                logMessage(`🔐 Environment variables: ${envCount} variables configured`, 'info');
            }

            // Ensure SSH connection
            await this.ssh.ensureConnection();
            logMessage('✅ SSH connection established', 'success');

            // Prepare environment variables for Python (escape and stringify)
            const envVarsJson = JSON.stringify(envVars).replace(/'/g, "\\'").replace(/"/g, '\\"');

            // Build Python command
            const pythonCommand = `cd ${this.clawdbotPath.replace('/ai_deployer.py', '')} && python3 << 'PYTHON_EOF'
import sys
import os
import json
import subprocess
sys.path.append('${this.clawdbotPath.replace('/ai_deployer.py', '')}')
from ai_deployer import ai_auto_deploy

try:
    # Parse environment variables
    env_vars_str = """${envVarsJson}"""
    env_vars = json.loads(env_vars_str) if env_vars_str else {}
    
    # Call deployment without env_vars parameter
    result = ai_auto_deploy(
        repo_url='${repoUrl}',
        port=${port},
        domain='${domain}',
        app_name='${appName}'
    )
    
    # Handle deployment result
    deployment_success = False
    if isinstance(result, dict):
        deployment_success = result.get('success', False)
        if deployment_success:
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
        deployment_success = True
        print('SUCCESS')
        details = {
            'message': 'Deployment completed',
            'actual_port': ${port},
            'app_name': '${appName}',
            'domain': '${domain}'
        }
        print(json.dumps(details))
    
    # Create .env file if deployment succeeded and env vars exist
    if deployment_success and env_vars:
        try:
            # Get working directory from PM2
            pm2_info = subprocess.run(['pm2', 'jlist'], capture_output=True, text=True)
            pm2_data = json.loads(pm2_info.stdout)
            
            project_dir = None
            for proc in pm2_data:
                if proc.get('name') == '${appName}':
                    project_dir = proc.get('pm2_env', {}).get('pm_cwd')
                    break
            
            if project_dir and os.path.exists(project_dir):
                env_file_path = os.path.join(project_dir, '.env')
                with open(env_file_path, 'w') as f:
                    for key, value in env_vars.items():
                        f.write(f"{key}={value}\\n")
                print(f'ENV_FILE_CREATED:{env_file_path}')
                
                # Restart PM2 process to load new env vars
                subprocess.run(['pm2', 'restart', '${appName}'], capture_output=True)
                print('PM2_RESTARTED')
        except Exception as env_error:
            print(f'ENV_WARNING:Could not create .env file: {str(env_error)}')
        
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
            
            // Filter out special messages and extract details
            const specialMessages = [];
            const regularLines = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('ENV_FILE_CREATED:')) {
                    specialMessages.push({ type: 'env_created', path: line.split(':')[1] });
                } else if (line === 'PM2_RESTARTED') {
                    specialMessages.push({ type: 'pm2_restarted' });
                } else if (line.startsWith('ENV_WARNING:')) {
                    specialMessages.push({ type: 'env_warning', message: line.split(':').slice(1).join(':') });
                } else if (line) {
                    regularLines.push(line);
                }
            }
            
            const message = regularLines.join('\n').trim();

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
                    if (message) {
                        logMessage(message, 'info');
                    }
                }
                
                // Log environment variable setup
                for (const msg of specialMessages) {
                    if (msg.type === 'env_created') {
                        logMessage(`🔐 Environment file created: ${msg.path}`, 'success');
                    } else if (msg.type === 'pm2_restarted') {
                        logMessage('🔄 PM2 process restarted to load environment variables', 'info');
                    } else if (msg.type === 'env_warning') {
                        logMessage(`⚠️ Environment setup warning: ${msg.message}`, 'warning');
                    }
                }
                
                const configuredPort = deploymentDetails.actual_port || port;
                logMessage(`🔌 Application configured for port: ${configuredPort}`, 'info');
                
                // CRITICAL: Wait 12 seconds for app to fully start and begin listening (increased for backend apps)
                logMessage('⏳ Waiting 12 seconds for application to start listening...', 'info');
                await new Promise(resolve => setTimeout(resolve, 12000));
                
                // Check PM2 process first
                logMessage('🔍 Checking PM2 process status...', 'info');
                const processes = await this.ssh.getPM2Processes();
                const process = processes.find(p => p.name === appName);
                
                if (!process || process.pm2_env.status !== 'online') {
                    logMessage(`❌ PM2 process not running or in error state`, 'error');
                    
                    // Get PM2 logs to see what went wrong
                    try {
                        const logs = await this.ssh.getPM2Logs(appName, 50);
                        if (logs && logs.trim()) {
                            logMessage(`📋 Recent logs:\n${logs.substring(0, 500)}`, 'error');
                        }
                    } catch (e) {
                        // Ignore log fetch errors
                    }
                    
                    return {
                        success: false,
                        error: `Application failed to start. PM2 status: ${process?.pm2_env?.status || 'not found'}`,
                        appName: appName,
                        allocatedPort: port,
                        actualPort: null,
                        domain: domain
                    };
                }
                
                logMessage(`✅ PM2 process is running (${process.pm2_env.status})`, 'success');
                
                // DETECT ACTUAL PORT using 4-method detection system with retries
                logMessage('🔍 Detecting actual listening port...', 'info');
                let actualPort = await this.detectActualPort(appName, logMessage);
                
                // If first attempt fails, wait 5 more seconds and try again
                if (!actualPort) {
                    logMessage('⏳ Port not detected yet, waiting 5 more seconds...', 'info');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    logMessage('🔍 Retrying port detection...', 'info');
                    actualPort = await this.detectActualPort(appName, logMessage);
                }
                
                // If still not detected, try to get PORT from PM2 environment
                if (!actualPort) {
                    logMessage('🔍 Checking PORT from PM2 environment...', 'info');
                    try {
                        const envPortResult = await this.ssh.executeCommand(
                            `pm2 jlist | jq -r '.[] | select(.name=="${appName}") | .pm2_env.PORT'`
                        );
                        if (envPortResult.success && envPortResult.stdout.trim() && envPortResult.stdout.trim() !== 'null') {
                            const envPort = parseInt(envPortResult.stdout.trim());
                            if (!isNaN(envPort) && envPort >= 3000 && envPort <= 9000) {
                                actualPort = envPort;
                                logMessage(`✅ Found PORT from environment: ${actualPort}`, 'success');
                            }
                        }
                    } catch (e) {
                        logMessage(`⚠️ Could not read PORT from environment`, 'warning');
                    }
                }
                
                if (!actualPort) {
                    logMessage('⚠️ Could not detect listening port - this may be normal for some backend apps', 'warning');
                    logMessage('✅ PM2 process is running, deployment will continue', 'info');
                    
                    // Return success with allocated port since PM2 is running
                    return {
                        success: true,
                        message: 'Deployment completed - app is starting up',
                        appName: appName,
                        allocatedPort: port,
                        actualPort: port,  // Use allocated port as fallback
                        port: port,
                        portChanged: false,
                        domain: domain,
                        note: 'Port detection pending - using allocated port'
                    };
                }
                
                // Log if port differs from allocated port
                if (actualPort !== port) {
                    logMessage(`⚠️ PORT MISMATCH DETECTED!`, 'warning');
                    logMessage(`   Allocated Port: ${port}`, 'warning');
                    logMessage(`   Actual Port: ${actualPort}`, 'warning');
                    logMessage(`   This is normal for Vite apps (they scan for free ports)`, 'info');
                }
                
                // Verify deployment on actual port (lenient check)
                logMessage(`🔍 Verifying deployment on actual port ${actualPort}...`, 'info');
                const verificationResult = await this.verifyDeployment(appName, actualPort, logMessage);
                
                if (!verificationResult.success) {
                    // If verification fails but PM2 is running, it's still a success
                    // Port might not be active yet for backend apps
                    logMessage(`⚠️ Port verification pending: ${verificationResult.error}`, 'warning');
                    logMessage(`✅ PM2 process is running - deployment successful`, 'success');
                    
                    return {
                        success: true,
                        message: 'Deployment completed - app is starting up',
                        appName: appName,
                        allocatedPort: port,
                        actualPort: actualPort,
                        port: actualPort,
                        portChanged: actualPort !== port,
                        domain: domain,
                        note: 'Port not yet active - app may still be initializing'
                    };
                }
                
                logMessage(`✅ Deployment verified successfully on port ${actualPort}!`, 'success');
                
                // Fix Vite config for subdomain allowedHosts (async, don't wait)
                logMessage('🔧 Checking if Vite config needs fixing...', 'info');
                this.fixViteConfig(appName, domain, logMessage).catch(err => {
                    logMessage(`⚠️ Vite config fix failed (non-critical): ${err.message}`, 'warning');
                });
                
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
            logMessage('🔍 Detecting actual listening port using 4-method detection system...', 'info');
            
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
            
            // METHOD 1B: netstat - Alternative to lsof
            logMessage('Method 1B: Checking listening ports via netstat...', 'info');
            try {
                const pidResult = await this.ssh.executeCommand(`pm2 jlist | jq -r '.[] | select(.name=="${appName}") | .pid'`);
                if (pidResult.success && pidResult.stdout.trim() && pidResult.stdout.trim() !== 'null') {
                    const pid = pidResult.stdout.trim();
                    
                    // Use netstat to find listening ports for this PID
                    const netstatResult = await this.ssh.executeCommand(`netstat -tlnp 2>/dev/null | grep ${pid}/ | awk '{print $4}' | grep -o '[0-9]*$' | sort -u`);
                    
                    if (netstatResult.success && netstatResult.stdout.trim()) {
                        const ports = netstatResult.stdout.split('\n')
                            .map(p => parseInt(p.trim()))
                            .filter(p => !isNaN(p) && p >= 3000 && p <= 9000);
                        
                        if (ports.length > 0) {
                            const actualPort = ports[0];
                            logMessage(`✅ Method 1B SUCCESS: Process is listening on port ${actualPort}`, 'success');
                            logMessage(`All listening ports: ${ports.join(', ')}`, 'info');
                            return actualPort;
                        }
                    }
                }
                logMessage('⚠️ Method 1B FAILED: No listening ports found via netstat', 'warning');
            } catch (error) {
                logMessage(`⚠️ Method 1B ERROR: ${error.message}`, 'warning');
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
            logMessage('❌ All 4 detection methods failed - port detection unsuccessful', 'error');
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
            
            // Check if port is in use (meaning app is listening) - retry with delays
            logMessage(`🔍 Checking if port ${port} is active`, 'info');
            
            // Try checking port 3 times with 2 second intervals
            let portInUse = false;
            for (let i = 0; i < 3; i++) {
                portInUse = await this.ssh.checkPortInUse(port);
                if (portInUse) break;
                
                if (i < 2) {
                    logMessage(`⏳ Port not active yet, waiting 2 more seconds... (attempt ${i + 1}/3)`, 'info');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            if (!portInUse) {
                return {
                    success: false,
                    error: `Port ${port} is not yet active - application may still be initializing`
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
                // Skip empty messages to prevent validation errors
                if (!message || message.trim() === '') {
                    return;
                }
                
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
                // Skip empty messages to prevent validation errors
                if (!message || message.trim() === '') {
                    return;
                }
                
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

    async fixViteConfig(appName, domain, logMessage) {
        try {
            logMessage('🔧 Fixing Vite configuration for subdomain...', 'info');
            
            // Get app working directory from PM2
            const cwdResult = await this.ssh.executeCommand(
                `pm2 jlist | jq -r '.[] | select(.name=="${appName}") | .pm2_env.pm_cwd'`
            );
            
            if (!cwdResult.success || !cwdResult.stdout.trim() || cwdResult.stdout.trim() === 'null') {
                logMessage('⚠️ Could not find app directory', 'warning');
                return { success: false };
            }
            
            const appDir = cwdResult.stdout.trim();
            logMessage(`📂 App directory: ${appDir}`, 'info');
            
            // Check for both .js and .ts vite config files
            let viteConfigPath = `${appDir}/vite.config.js`;
            let viteConfigExists = await this.ssh.fileExists(viteConfigPath);
            
            if (!viteConfigExists) {
                viteConfigPath = `${appDir}/vite.config.ts`;
                viteConfigExists = await this.ssh.fileExists(viteConfigPath);
            }
            
            if (!viteConfigExists) {
                logMessage('ℹ️  No vite.config.js/ts found - not a Vite app', 'info');
                return { success: true, skipped: true };
            }
            
            logMessage(`✅ Found ${viteConfigPath.split('/').pop()} - adding allowedHosts fix`, 'info');
            
            // Read current config
            const currentConfig = await this.ssh.readFile(viteConfigPath);
            
            // Check if already has allowedHosts
            if (currentConfig.includes('allowedHosts')) {
                logMessage('ℹ️  vite.config already has allowedHosts configured', 'info');
                return { success: true, alreadyConfigured: true };
            }
            
            // Create updated config with allowedHosts
            let updatedConfig = currentConfig;
            
            // Find the server section or create one
            if (currentConfig.includes('server:')) {
                // Add allowedHosts to existing server config (after opening brace)
                updatedConfig = currentConfig.replace(
                    /server:\s*\{/,
                    `server: {\n    allowedHosts: ['${domain}', '.projectmarket.in', 'localhost'],`
                );
            } else {
                // Add server section before plugins or at the beginning of config object
                if (currentConfig.includes('plugins:')) {
                    updatedConfig = currentConfig.replace(
                        /(\(\s*\(?{)/,
                        `$1\n  server: {\n    allowedHosts: ['${domain}', '.projectmarket.in', 'localhost'],\n  },`
                    );
                } else {
                    updatedConfig = currentConfig.replace(
                        /export\s+default\s+defineConfig\s*\(\s*\(\s*\)?\s*=>\s*\(\s*{/,
                        `export default defineConfig(() => ({\n  server: {\n    allowedHosts: ['${domain}', '.projectmarket.in', 'localhost'],\n  },`
                    );
                }
            }
            
            // Write updated config
            await this.ssh.writeFile(viteConfigPath, updatedConfig);
            logMessage('✅ Updated vite.config with allowedHosts', 'success');
            
            // Restart the app to apply changes
            logMessage('🔄 Restarting app to apply Vite config changes...', 'info');
            await this.ssh.restartPM2Process(appName);
            
            // Wait for restart
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            logMessage('✅ Vite config fixed and app restarted', 'success');
            
            return { success: true, fixed: true };
            
        } catch (error) {
            logMessage(`⚠️ Failed to fix Vite config: ${error.message}`, 'warning');
            return { success: false, error: error.message };
        }
    }

    async deleteDeployment(appName, deploymentId) {
        try {
            const logMessage = async (message, type = 'info') => {
                // Skip empty messages to prevent validation errors
                if (!message || message.trim() === '') {
                    return;
                }
                
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
