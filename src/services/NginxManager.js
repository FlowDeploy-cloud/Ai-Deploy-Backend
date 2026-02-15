const { getSSHManager } = require('./SSHManager');

class NginxManager {
    constructor() {
        this.ssh = getSSHManager();
        this.baseDomain = process.env.BASE_DOMAIN || 'projectmarket.in';
        this.enableSSL = process.env.ENABLE_SSL !== 'false'; // Enable SSL by default
    }

    async obtainSSLCertificate(fullDomain) {
        console.log(`🔒 Obtaining SSL certificate for ${fullDomain}...`);
        
        try {
            // Stop nginx temporarily
            console.log('⏸️  Stopping nginx...');
            await this.ssh.executeCommand('systemctl stop nginx');
            
            // Get SSL certificate with certbot
            const certbotCommand = `certbot certonly --standalone -d ${fullDomain} --non-interactive --agree-tos --email admin@${this.baseDomain}`;
            const certResult = await this.ssh.executeCommand(certbotCommand);
            
            // Start nginx back
            console.log('▶️  Starting nginx...');
            await this.ssh.executeCommand('systemctl start nginx');
            
            if (certResult.stdout.includes('Successfully received certificate') || 
                certResult.stdout.includes('Certificate not yet due for renewal')) {
                console.log(`✅ SSL certificate obtained for ${fullDomain}`);
                return true;
            } else {
                console.error('❌ Failed to obtain SSL certificate:', certResult.stderr);
                return false;
            }
        } catch (error) {
            console.error('❌ Error obtaining SSL certificate:', error.message);
            // Make sure nginx is started even if cert fails
            await this.ssh.executeCommand('systemctl start nginx');
            return false;
        }
    }

    async createSubdomainConfig(subdomain, port, isBackend = false) {
        const fullDomain = isBackend 
            ? `${subdomain}-api.${this.baseDomain}`
            : `${subdomain}.${this.baseDomain}`;

        let config;
        let useHTTPS = false;

        // Try to get SSL certificate first
        if (this.enableSSL) {
            const sslObtained = await this.obtainSSLCertificate(fullDomain);
            if (sslObtained) {
                useHTTPS = true;
                // Create HTTPS config with redirect
                config = `server {
    listen 80;
    server_name ${fullDomain};
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${fullDomain};

    ssl_certificate /etc/letsencrypt/live/${fullDomain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${fullDomain}/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';

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
            } else {
                console.log('⚠️  SSL certificate failed, falling back to HTTP');
            }
        }

        // Fallback to HTTP-only config if SSL failed or disabled
        if (!useHTTPS) {
            config = `server {
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
        }

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

            const protocol = useHTTPS ? 'https' : 'http';
            return {
                success: true,
                domain: fullDomain,
                url: `${protocol}://${fullDomain}`,
                secure: useHTTPS
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

            // Try to delete SSL certificate (optional, won't fail if doesn't exist)
            try {
                await this.ssh.executeCommand(`certbot delete --cert-name ${fullDomain} --non-interactive`);
                console.log(`✅ Deleted SSL certificate for ${fullDomain}`);
            } catch (certError) {
                console.log(`ℹ️  No SSL certificate to delete for ${fullDomain}`);
            }

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
