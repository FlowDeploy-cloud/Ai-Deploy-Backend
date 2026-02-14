const crypto = require('crypto');

class SubdomainGenerator {
    constructor() {
        this.chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        this.length = 6;
        this.usedSubdomains = new Set();
    }

    generate(length = this.length) {
        let subdomain = '';
        
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * this.chars.length);
            subdomain += this.chars[randomIndex];
        }
        
        // Ensure subdomain starts with a letter (not a number)
        if (/^\d/.test(subdomain)) {
            const randomLetter = this.chars[Math.floor(Math.random() * 26)];
            subdomain = randomLetter + subdomain.slice(1);
        }
        
        return subdomain;
    }

    generateUnique(existingSubdomains = [], maxAttempts = 100) {
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            const subdomain = this.generate();
            
            if (!existingSubdomains.includes(subdomain) && !this.usedSubdomains.has(subdomain)) {
                this.usedSubdomains.add(subdomain);
                return subdomain;
            }
            
            attempts++;
        }
        
        // If we couldn't find unique subdomain with 6 chars, try with 8
        return this.generate(8);
    }

    generateFromName(name) {
        // Clean name: lowercase, remove special chars, max 20 chars
        let cleaned = name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 20);
        
        // Add random suffix to ensure uniqueness
        const suffix = this.generate(4);
        
        return `${cleaned}-${suffix}`;
    }

    generateSecure() {
        // Generate cryptographically secure subdomain
        const bytes = crypto.randomBytes(4);
        return bytes.toString('hex').slice(0, 6);
    }

    validate(subdomain) {
        // Check if subdomain is valid
        const regex = /^[a-z][a-z0-9-]{2,62}$/;
        return regex.test(subdomain);
    }

    releaseSubdomain(subdomain) {
        this.usedSubdomains.delete(subdomain);
    }
}

module.exports = SubdomainGenerator;
