const { getSSHManager } = require('./SSHManager');

class NginxManager {
    constructor() {
        this.ssh = getSSHManager();
        this.baseDomain = process.env.BASE_DOMAIN || 'projectmarket.in';
    }

    async createSubdomainConfig(subdomain, port, isBackend = false) {
        const fullDomain = isBackend 
            ? `${subdomain}-api.${this.baseDomain}`
            : `${subdomain}.${this.baseDomain}`;

        const config = `server {
    listen 80;
    server_name ${fullDomain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}`;

        const configPath = `/etc/nginx/sites-available/${fullDomain}`;
        const enabledPath = `/etc/nginx/sites-enabled/${fullDomain}`;

        try {
            // Write config file
            await this.ssh.writeFile(configPath, config);
            console.log(`✅ Created nginx config for ${fullDomain}`);

            // Create symlink
            const symlinkCommand = `ln -sf ${configPath} ${enabledPath}`;
            await this.ssh.executeCommand(symlinkCommand);
            console.log(`✅ Enabled nginx site ${fullDomain}`);

            // Test nginx configuration
            const testResult = await this.ssh.executeCommand('/usr/sbin/nginx -t');
            
            if (!testResult.success) {
                console.error('❌ Nginx config test failed:', testResult.stderr);
                throw new Error('Nginx configuration test failed: ' + testResult.stderr);
            }

            // Reload nginx
            const reloadResult = await this.ssh.executeCommand('systemctl reload nginx');
            
            if (!reloadResult.success) {
                console.error('❌ Nginx reload failed:', reloadResult.stderr);
                throw new Error('Nginx reload failed: ' + reloadResult.stderr);
            }

            console.log(`✅ Nginx reloaded successfully`);

            return {
                success: true,
                domain: fullDomain,
                url: `http://${fullDomain}`
            };

        } catch (error) {
            console.error(`❌ Failed to create nginx config for ${fullDomain}:`, error.message);
            throw error;
        }
    }

    async deleteSubdomainConfig(subdomain, isBackend = false) {
        const fullDomain = isBackend 
            ? `${subdomain}-api.${this.baseDomain}`
            : `${subdomain}.${this.baseDomain}`;

        const configPath = `/etc/nginx/sites-available/${fullDomain}`;
        const enabledPath = `/etc/nginx/sites-enabled/${fullDomain}`;

        try {
            // Remove symlink
            await this.ssh.executeCommand(`rm -f ${enabledPath}`);
            
            // Remove config file
            await this.ssh.executeCommand(`rm -f ${configPath}`);

            // Reload nginx
            await this.ssh.executeCommand('systemctl reload nginx');

            console.log(`✅ Deleted nginx config for ${fullDomain}`);

            return {
                success: true,
                domain: fullDomain
            };

        } catch (error) {
            console.error(`❌ Failed to delete nginx config for ${fullDomain}:`, error.message);
            throw error;
        }
    }

    async checkNginxStatus() {
        try {
            const result = await this.ssh.executeCommand('systemctl status nginx');
            return {
                running: result.stdout.includes('active (running)'),
                output: result.stdout
            };
        } catch (error) {
            return {
                running: false,
                error: error.message
            };
        }
    }

    async testNginxConfig() {
        const result = await this.ssh.executeCommand('/usr/sbin/nginx -t');
        return result.success;
    }

    async reloadNginx() {
        const result = await this.ssh.executeCommand('systemctl reload nginx');
        return result.success;
    }

    async listSubdomains() {
        const result = await this.ssh.executeCommand(`ls -1 /etc/nginx/sites-enabled/ | grep "${this.baseDomain}"`);
        
        if (result.success) {
            return result.stdout.split('\n').filter(line => line.trim());
        }
        
        return [];
    }
}

module.exports = NginxManager;
