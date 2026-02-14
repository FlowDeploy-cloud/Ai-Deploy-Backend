const Deployment = require('../models/Deployment');
const DeploymentLog = require('../models/DeploymentLog');
const User = require('../models/User');
const ClawdBotService = require('./ClawdBotService');
const PortManager = require('./PortManager');
const NginxManager = require('./NginxManager');
const SubdomainGenerator = require('../utils/SubdomainGenerator');

class DeploymentService {
    constructor() {
        this.clawdBot = new ClawdBotService();
        this.portManager = new PortManager();
        this.nginxManager = new NginxManager();
        this.subdomainGenerator = new SubdomainGenerator();
    }

    // Emit Socket.IO event to user
    emitToUser(userId, event, data) {
        if (global.io) {
            global.io.to(`user_${userId}`).emit(event, data);
            console.log(`📡 Emitted ${event} to user_${userId}`);
        }
    }

    async deploy(userId, deploymentData, onLog) {
        const logMessage = (message, type = 'info') => {
            console.log(`[${type.toUpperCase()}] ${message}`);
            if (onLog) onLog(message, type);
        };

        let deployment;
        let deploymentId;

        try {
            // Check if deployment_id is provided (pre-created deployment)
            if (deploymentData.deployment_id) {
                deployment = await Deployment.findById(deploymentData.deployment_id);
                if (!deployment) {
                    throw new Error('Pre-created deployment not found');
                }
                deploymentId = deployment.id;
                logMessage(`📦 Using existing deployment: ${deployment.deployment_id}`, 'info');
            } else {
                // 1. Validate user can deploy
                const canDeploy = await User.canDeploy(userId);
                if (!canDeploy) {
                    throw new Error('Deployment limit reached. Please upgrade your plan.');
                }

                logMessage('✅ User validation passed', 'info');

                // 2. Generate unique subdomain
                const existingDeployments = await Deployment.findByUserId(userId);
                const existingSubdomains = existingDeployments.map(d => d.subdomain);
                const subdomain = this.subdomainGenerator.generateUnique(existingSubdomains);

                logMessage(`📝 Generated subdomain: ${subdomain}`, 'info');

                // 3. Create deployment record
                deployment = await Deployment.create({
                    user_id: userId,
                    name: deploymentData.name || `Deployment ${subdomain}`,
                    subdomain,
                    frontend_repo: deploymentData.frontend_repo,
                    backend_repo: deploymentData.backend_repo,
                    frontend_description: deploymentData.frontend_description,
                    backend_description: deploymentData.backend_description,
                    custom_domain: deploymentData.custom_domain,
                    env_vars: deploymentData.env_vars || {},
                    status: 'deploying'
                });

                deploymentId = deployment.id;
                logMessage(`📦 Deployment record created: ${deployment.deployment_id}`, 'success');
            }

            // 4. Find free ports
            const portsNeeded = [];
            if (deploymentData.frontend_repo || deployment.frontend_repo) portsNeeded.push('frontend');
            if (deploymentData.backend_repo || deployment.backend_repo) portsNeeded.push('backend');

            const ports = await this.portManager.findMultipleFreePorts(portsNeeded.length);
            
            const frontend_port = (deploymentData.frontend_repo || deployment.frontend_repo) ? ports[0] : null;
            const backend_port = (deploymentData.backend_repo || deployment.backend_repo) ? (portsNeeded.length > 1 ? ports[1] : ports[0]) : null;

            logMessage(`🔌 Allocated ports: Frontend=${frontend_port}, Backend=${backend_port}`, 'info');

            // 5. Update deployment with ports and PM2 names
            const subdomain = deployment.subdomain;
            await Deployment.update(deploymentId, {
                frontend_port,
                frontend_allocated_port: frontend_port,
                frontend_actual_port: null,
                backend_port,
                backend_allocated_port: backend_port,
                backend_actual_port: null,
                pm2_frontend_name: (deploymentData.frontend_repo || deployment.frontend_repo) ? `user${userId}_${subdomain}_frontend` : null,
                pm2_backend_name: (deploymentData.backend_repo || deployment.backend_repo) ? `user${userId}_${subdomain}_backend` : null
            });

            // Refresh deployment object
            deployment = await Deployment.findById(deploymentId);

            // Log helper that includes deployment ID and emits to Socket.IO
            const log = (message, type = 'info') => {
                logMessage(message, type);
                DeploymentLog.create(deploymentId, message, type).catch(console.error);
                
                // Emit log to user via Socket.IO
                this.emitToUser(userId, 'log', {
                    message,
                    type,
                    timestamp: new Date().toISOString()
                });
            };

            // 6. Deploy frontend if present
            let frontendResult = null;
            if (deployment.frontend_repo) {
                log('🚀 Deploying frontend...', 'info');
                
                frontendResult = await this.clawdBot.deploy(
                    deploymentId,
                    deployment.frontend_repo,
                    frontend_port,
                    `${subdomain}.${process.env.BASE_DOMAIN}`,
                    deployment.pm2_frontend_name,
                    log
                );

                if (frontendResult.success) {
                    // Get actual port detected by the 3-method detection system
                    const actualPort = frontendResult.actualPort || frontendResult.port;
                    const allocatedPort = frontendResult.allocatedPort || frontend_port;
                    
                    if (frontendResult.portChanged) {
                        log(`⚠️ Port mismatch detected:`, 'warning');
                        log(`   Allocated: ${allocatedPort} → Actual: ${actualPort}`, 'warning');
                    }
                    
                    log(`🔌 Frontend running on port: ${actualPort} (allocated: ${allocatedPort})`, 'info');
                    
                    // Create nginx config pointing to ACTUAL port (not allocated)
                    const nginxResult = await this.nginxManager.createSubdomainConfig(subdomain, actualPort, false);
                    
                    // Update deployment with both ports
                    await Deployment.update(deploymentId, {
                        frontend_url: nginxResult.url,
                        frontend_port: actualPort,              // Actual port for backwards compatibility
                        frontend_allocated_port: allocatedPort, // Port we tried to allocate
                        frontend_actual_port: actualPort        // Port app is actually using
                    });

                    log(`✅ Frontend deployed: ${nginxResult.url} (port ${actualPort})`, 'success');
                } else {
                    log(`❌ Frontend deployment failed: ${frontendResult.error}`, 'error');
                }
            }

            // 7. Deploy backend if present
            let backendResult = null;
            if (deployment.backend_repo) {
                log('🚀 Deploying backend...', 'info');
                
                backendResult = await this.clawdBot.deploy(
                    deploymentId,
                    deployment.backend_repo,
                    backend_port,
                    `${subdomain}-api.${process.env.BASE_DOMAIN}`,
                    deployment.pm2_backend_name,
                    log
                );

                if (backendResult.success) {
                    // Get actual port detected by the 3-method detection system
                    const actualPort = backendResult.actualPort || backendResult.port;
                    const allocatedPort = backendResult.allocatedPort || backend_port;
                    
                    if (backendResult.portChanged) {
                        log(`⚠️ Backend port mismatch detected:`, 'warning');
                        log(`   Allocated: ${allocatedPort} → Actual: ${actualPort}`, 'warning');
                    }
                    
                    log(`🔌 Backend running on port: ${actualPort} (allocated: ${allocatedPort})`, 'info');
                    
                    // Create nginx config pointing to ACTUAL port (not allocated)
                    const nginxResult = await this.nginxManager.createSubdomainConfig(subdomain, actualPort, true);
                    
                    // Update deployment with both ports
                    await Deployment.update(deploymentId, {
                        backend_url: nginxResult.url,
                        backend_port: actualPort,              // Actual port for backwards compatibility
                        backend_allocated_port: allocatedPort, // Port we tried to allocate
                        backend_actual_port: actualPort        // Port app is actually using
                    });

                    log(`✅ Backend deployed: ${nginxResult.url} (port ${actualPort})`, 'success');
                } else {
                    log(`❌ Backend deployment failed: ${backendResult.error}`, 'error');
                }
            }

            // 8. Update deployment status
            const overallSuccess = (frontendResult === null || frontendResult.success) && 
                                    (backendResult === null || backendResult.success);

            await Deployment.updateStatus(deploymentId, overallSuccess ? 'deployed' : 'failed');

            if (overallSuccess) {
                log('🎉 Deployment completed successfully!', 'success');
            } else {
                log('⚠️ Deployment completed with errors', 'warning');
            }

            // 9. Return final deployment info
            const finalDeployment = await Deployment.findById(deploymentId);

            // 10. Emit Socket.IO event to user
            if (overallSuccess) {
                this.emitToUser(userId, 'status', {
                    type: 'status',
                    status: 'deployed',
                    url: finalDeployment.frontend_url || finalDeployment.backend_url,
                    deployment: finalDeployment
                });
                this.emitToUser(userId, 'log', {
                    message: '✅ Deployment completed successfully!',
                    type: 'success',
                    timestamp: new Date().toISOString()
                });
            } else {
                this.emitToUser(userId, 'status', {
                    type: 'status',
                    status: 'failed',
                    error: 'Deployment failed'
                });
            }
            return {
                success: overallSuccess,
                deployment: finalDeployment,
                frontendResult,
                backendResult
            };

        } catch (error) {
            logMessage(`❌ Deployment error: ${error.message}`, 'error');
            
            // Emit error to user via Socket.IO
            this.emitToUser(userId, 'status', {
                type: 'status',
                status: 'failed',
                error: error.message
            });
            this.emitToUser(userId, 'log', {
                message: `❌ Deployment error: ${error.message}`,
                type: 'error',
                timestamp: new Date().toISOString()
            });
            
            throw error;
        }
    }

    async stopDeployment(deploymentId) {
        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            throw new Error('Deployment not found');
        }

        const results = [];

        if (deployment.pm2_frontend_name) {
            const result = await this.clawdBot.stopDeployment(deployment.pm2_frontend_name, deploymentId);
            results.push({ type: 'frontend', ...result });
        }

        if (deployment.pm2_backend_name) {
            const result = await this.clawdBot.stopDeployment(deployment.pm2_backend_name, deploymentId);
            results.push({ type: 'backend', ...result });
        }

        const allSuccess = results.every(r => r.success);
        
        if (allSuccess) {
            await Deployment.updateStatus(deploymentId, 'stopped');
        }

        return { success: allSuccess, results };
    }

    async restartDeployment(deploymentId) {
        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            throw new Error('Deployment not found');
        }

        const results = [];

        if (deployment.pm2_frontend_name) {
            const result = await this.clawdBot.restartDeployment(deployment.pm2_frontend_name, deploymentId);
            results.push({ type: 'frontend', ...result });
        }

        if (deployment.pm2_backend_name) {
            const result = await this.clawdBot.restartDeployment(deployment.pm2_backend_name, deploymentId);
            results.push({ type: 'backend', ...result });
        }

        const allSuccess = results.every(r => r.success);
        
        if (allSuccess) {
            await Deployment.updateStatus(deploymentId, 'deployed');
        }

        return { success: allSuccess, results };
    }

    async deleteDeployment(deploymentId) {
        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            throw new Error('Deployment not found');
        }

        // 1. Stop PM2 processes
        if (deployment.pm2_frontend_name) {
            await this.clawdBot.deleteDeployment(deployment.pm2_frontend_name, deploymentId);
        }

        if (deployment.pm2_backend_name) {
            await this.clawdBot.deleteDeployment(deployment.pm2_backend_name, deploymentId);
        }

        // 2. Delete nginx configs
        if (deployment.subdomain) {
            await this.nginxManager.deleteSubdomainConfig(deployment.subdomain, false);
            if (deployment.backend_repo) {
                await this.nginxManager.deleteSubdomainConfig(deployment.subdomain, true);
            }
        }

        // 3. Release ports
        if (deployment.frontend_port) {
            this.portManager.releasePort(deployment.frontend_port);
        }
        if (deployment.backend_port) {
            this.portManager.releasePort(deployment.backend_port);
        }

        // 4. Delete deployment logs
        await DeploymentLog.deleteByDeploymentId(deploymentId);

        // 5. Delete deployment record
        await Deployment.delete(deploymentId);

        return { success: true };
    }

    async getDeploymentStatus(deploymentId) {
        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            throw new Error('Deployment not found');
        }

        const status = {};

        if (deployment.pm2_frontend_name) {
            status.frontend = await this.clawdBot.checkDeploymentStatus(deployment.pm2_frontend_name);
        }

        if (deployment.pm2_backend_name) {
            status.backend = await this.clawdBot.checkDeploymentStatus(deployment.pm2_backend_name);
        }

        return { deployment, status };
    }

    async getDeploymentLogs(deploymentId, lines = 100) {
        const logs = await DeploymentLog.findByDeploymentId(deploymentId, lines);
        return logs;
    }

    async getDeploymentPM2Logs(deploymentId, target = 'frontend', lines = 100) {
        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            throw new Error('Deployment not found');
        }

        const processName = target === 'frontend' ? deployment.pm2_frontend_name : deployment.pm2_backend_name;
        
        if (!processName) {
            throw new Error(`${target} not deployed`);
        }

        const result = await this.clawdBot.getLogs(processName, lines);
        return result;
    }
}

module.exports = DeploymentService;
