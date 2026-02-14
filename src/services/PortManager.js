const { getSSHManager } = require('./SSHManager');

class PortManager {
    constructor() {
        this.ssh = getSSHManager();
        this.minPort = parseInt(process.env.MIN_PORT || '3100');
        this.maxPort = parseInt(process.env.MAX_PORT || '8900');
        this.usedPorts = new Set();
    }

    async findFreePort() {
        try {
            const port = await this.ssh.findFreePort();
            
            // Double check if port is really free
            const inUse = await this.ssh.checkPortInUse(port);
            
            if (!inUse) {
                this.usedPorts.add(port);
                console.log(`✅ Found free port: ${port}`);
                return port;
            }
            
            // If still in use, try again
            return await this.findFreePort();
            
        } catch (error) {
            console.error('❌ Failed to find free port:', error.message);
            throw new Error('No free ports available');
        }
    }

    async isPortFree(port) {
        try {
            const inUse = await this.ssh.checkPortInUse(port);
            return !inUse;
        } catch (error) {
            console.error(`❌ Failed to check port ${port}:`, error.message);
            return false;
        }
    }

    async getUsedPorts() {
        try {
            const command = `lsof -i -P -n | grep LISTEN | awk '{print $9}' | cut -d: -f2 | sort -u`;
            const result = await this.ssh.executeCommand(command);
            
            if (result.success) {
                const ports = result.stdout
                    .split('\n')
                    .map(p => parseInt(p.trim()))
                    .filter(p => !isNaN(p) && p >= this.minPort && p <= this.maxPort);
                
                return ports;
            }
            
            return [];
        } catch (error) {
            console.error('❌ Failed to get used ports:', error.message);
            return [];
        }
    }

    async findMultipleFreePorts(count = 2) {
        const ports = [];
        
        for (let i = 0; i < count; i++) {
            const port = await this.findFreePort();
            ports.push(port);
        }
        
        return ports;
    }

    releasePort(port) {
        this.usedPorts.delete(port);
    }
}

module.exports = PortManager;
