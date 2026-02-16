const axios = require('axios');

class GithubService {
    constructor() {
        this.clientId = process.env.GITHUB_CLIENT_ID;
        this.clientSecret = process.env.GITHUB_CLIENT_SECRET;
        this.redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:5173/auth/github/callback';
        
        // Track used authorization codes to prevent reuse
        this.usedCodes = new Map();
        
        // Clean up old codes every 15 minutes
        setInterval(() => {
            const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
            for (const [code, timestamp] of this.usedCodes.entries()) {
                if (timestamp < fifteenMinutesAgo) {
                    this.usedCodes.delete(code);
                }
            }
        }, 15 * 60 * 1000);
    }

    /**
     * Get the GitHub OAuth authorization URL
     */
    getAuthorizationUrl() {
        const scope = 'read:user user:email repo';
        return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${encodeURIComponent(scope)}`;
    }

    /**
     * Exchange authorization code for access token
     * CRITICAL: GitHub codes are SINGLE-USE and expire in 10 minutes
     */
    async getAccessToken(code) {
        // Prevent code reuse (protection against double execution)
        if (this.usedCodes.has(code)) {
            console.error('⚠️ Authorization code already used:', code.substring(0, 8) + '...');
            throw new Error('Authorization code has already been used. Please login again.');
        }

        try {
            console.log('🔄 Exchanging authorization code for access token...');
            
            const response = await axios.post(
                'https://github.com/login/oauth/access_token',
                {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code,
                    redirect_uri: this.redirectUri
                },
                {
                    headers: {
                        Accept: 'application/json'
                    },
                    timeout: 10000 // 10 second timeout
                }
            );

            console.log('📦 GitHub token response received');

            // Check for errors in response
            if (response.data.error) {
                console.error('❌ GitHub OAuth error:', {
                    error: response.data.error,
                    description: response.data.error_description
                });
                
                if (response.data.error === 'bad_verification_code') {
                    throw new Error('GitHub authorization code is invalid or expired. Please try logging in again.');
                }
                
                throw new Error(response.data.error_description || 'Failed to get access token from GitHub');
            }

            // Validate access token exists
            if (!response.data.access_token) {
                console.error('❌ No access token in response:', response.data);
                throw new Error('GitHub did not return an access token');
            }

            // Mark code as used
            this.usedCodes.set(code, Date.now());
            
            console.log('✅ Access token received successfully');
            return response.data.access_token;
            
        } catch (error) {
            // Don't log the full error to avoid exposing tokens
            if (error.message.includes('authorization code')) {
                throw error; // Re-throw our custom errors
            }
            
            console.error('❌ Error exchanging code for token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with GitHub. Please try again.');
        }
    }

    /**
     * Get user information from GitHub
     * CRITICAL: Use 'token' auth scheme, not 'Bearer'
     */
    async getUserInfo(accessToken) {
        if (!accessToken) {
            throw new Error('Access token is required');
        }

        try {
            console.log('👤 Fetching user information from GitHub...');
            
            // GitHub OAuth requires 'token' auth scheme (NOT 'Bearer')
            const headers = {
                Authorization: `token ${accessToken}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'FlowDeploy-App'
            };
            
            const [userResponse, emailResponse] = await Promise.all([
                axios.get('https://api.github.com/user', {
                    headers,
                    timeout: 10000
                }).catch(err => {
                    console.error('❌ Failed to fetch user:', err.response?.data);
                    throw err;
                }),
                axios.get('https://api.github.com/user/emails', {
                    headers,
                    timeout: 10000
                }).catch(err => {
                    console.error('❌ Failed to fetch emails:', err.response?.data);
                    throw err;
                })
            ]);

            const user = userResponse.data;
            const emails = emailResponse.data;

            console.log('✅ GitHub user fetched:', user.login);

            // Find primary verified email
            const primaryEmail = emails.find(e => e.primary && e.verified) || 
                                emails.find(e => e.verified) || 
                                emails[0];

            if (!primaryEmail?.email) {
                throw new Error('No verified email found on GitHub account');
            }

            return {
                githubId: user.id.toString(),
                username: user.login,
                email: primaryEmail.email,
                name: user.name,
                avatarUrl: user.avatar_url,
                bio: user.bio,
                publicRepos: user.public_repos
            };
        } catch (error) {
            if (error.response?.status === 401) {
                console.error('❌ GitHub API returned 401 Unauthorized');
                console.error('Token validity:', accessToken ? 'Token provided' : 'No token');
                throw new Error('GitHub access token is invalid. Please login again.');
            }
            
            if (error.message.includes('email')) {
                throw error; // Re-throw email-specific errors
            }
            
            console.error('❌ Error fetching user info:', error.response?.data || error.message);
            throw new Error('Failed to fetch user information from GitHub');
        }
    }

    /**
     * Get user's repositories (public only for now)
     */
    async getUserRepositories(accessToken) {
        try {
            const response = await axios.get('https://api.github.com/user/repos', {
                headers: {
                    Authorization: `token ${accessToken}`,
                    Accept: 'application/vnd.github.v3+json'
                },
                params: {
                    affiliation: 'owner',
                    sort: 'updated',
                    per_page: 100,
                    visibility: 'public'
                }
            });

            return response.data.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                html_url: repo.html_url,
                clone_url: repo.clone_url,
                ssh_url: repo.ssh_url,
                private: repo.private,
                language: repo.language,
                default_branch: repo.default_branch,
                updated_at: repo.updated_at,
                created_at: repo.created_at,
                stargazers_count: repo.stargazers_count,
                forks_count: repo.forks_count
            }));
        } catch (error) {
            console.error('Error getting repositories:', error.response?.data || error.message);
            throw new Error('Failed to get repositories from GitHub');
        }
    }

    /**
     * Get repository details
     */
    async getRepositoryDetails(accessToken, owner, repo) {
        try {
            const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
                headers: {
                    Authorization: `token ${accessToken}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            });

            return {
                id: response.data.id,
                name: response.data.name,
                full_name: response.data.full_name,
                description: response.data.description,
                html_url: response.data.html_url,
                clone_url: response.data.clone_url,
                default_branch: response.data.default_branch,
                language: response.data.language,
                private: response.data.private
            };
        } catch (error) {
            console.error('Error getting repository details:', error.response?.data || error.message);
            throw new Error('Failed to get repository details from GitHub');
        }
    }

    /**
     * Get repository branches
     */
    async getRepositoryBranches(accessToken, owner, repo) {
        try {
            const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/branches`, {
                headers: {
                    Authorization: `token ${accessToken}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            });

            return response.data.map(branch => ({
                name: branch.name,
                commit: {
                    sha: branch.commit.sha,
                    url: branch.commit.url
                }
            }));
        } catch (error) {
            console.error('Error getting branches:', error.response?.data || error.message);
            throw new Error('Failed to get branches from GitHub');
        }
    }
}

module.exports = new GithubService();
