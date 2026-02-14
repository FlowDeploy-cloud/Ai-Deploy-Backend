require('dotenv').config();
const { getSSHManager } = require('./src/services/SSHManager');
const PortManager = require('./src/services/PortManager');
const NginxManager = require('./src/services/NginxManager');
const SubdomainGenerator = require('./src/utils/SubdomainGenerator');

async function runTests() {
    console.log('🧪 ClawDeploy Backend Test Suite');
    console.log('=================================\n');

    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: SSH Connection
    console.log('Test 1: SSH Connection');
    try {
        const ssh = getSSHManager();
        await ssh.connect();
        console.log('✅ SSH connection successful\n');
        testsPassed++;
    } catch (error) {
        console.error('❌ SSH connection failed:', error.message, '\n');
        testsFailed++;
    }

    // Test 2: Execute Command
    console.log('Test 2: Execute Simple Command');
    try {
        const ssh = getSSHManager();
        const result = await ssh.executeCommand('echo "Hello from ClawDeploy"');
        if (result.success && result.stdout.includes('Hello from ClawDeploy')) {
            console.log('✅ Command execution successful\n');
            testsPassed++;
        } else {
            console.error('❌ Command execution failed\n');
            testsFailed++;
        }
    } catch (error) {
        console.error('❌ Command execution error:', error.message, '\n');
        testsFailed++;
    }

    // Test 3: Check PM2
    console.log('Test 3: Check PM2 Processes');
    try {
        const ssh = getSSHManager();
        const processes = await ssh.getPM2Processes();
        console.log(`✅ Found ${processes.length} PM2 processes\n`);
        testsPassed++;
    } catch (error) {
        console.error('❌ PM2 check failed:', error.message, '\n');
        testsFailed++;
    }

    // Test 4: Port Manager
    console.log('Test 4: Port Manager');
    try {
        const portManager = new PortManager();
        const port = await portManager.findFreePort();
        console.log(`✅ Found free port: ${port}\n`);
        testsPassed++;
    } catch (error) {
        console.error('❌ Port manager failed:', error.message, '\n');
        testsFailed++;
    }

    // Test 5: Subdomain Generator
    console.log('Test 5: Subdomain Generator');
    try {
        const generator = new SubdomainGenerator();
        const subdomain = generator.generate();
        if (generator.validate(subdomain)) {
            console.log(`✅ Generated valid subdomain: ${subdomain}\n`);
            testsPassed++;
        } else {
            console.error('❌ Generated invalid subdomain\n');
            testsFailed++;
        }
    } catch (error) {
        console.error('❌ Subdomain generator failed:', error.message, '\n');
        testsFailed++;
    }

    // Test 6: Nginx Status
    console.log('Test 6: Nginx Status');
    try {
        const nginxManager = new NginxManager();
        const status = await nginxManager.checkNginxStatus();
        if (status.running) {
            console.log('✅ Nginx is running\n');
            testsPassed++;
        } else {
            console.error('❌ Nginx is not running\n');
            testsFailed++;
        }
    } catch (error) {
        console.error('❌ Nginx check failed:', error.message, '\n');
        testsFailed++;
    }

    // Test 7: File Operations
    console.log('Test 7: File Operations');
    try {
        const ssh = getSSHManager();
        const testPath = '/tmp/clawdeploy-test.txt';
        const testContent = 'ClawDeploy Test ' + Date.now();
        
        await ssh.writeFile(testPath, testContent);
        const readContent = await ssh.readFile(testPath);
        
        if (readContent.trim() === testContent) {
            console.log('✅ File operations successful\n');
            testsPassed++;
            
            // Cleanup
            await ssh.executeCommand(`rm ${testPath}`);
        } else {
            console.error('❌ File content mismatch\n');
            testsFailed++;
        }
    } catch (error) {
        console.error('❌ File operations failed:', error.message, '\n');
        testsFailed++;
    }

    // Test 8: ClawdBot Path
    console.log('Test 8: ClawdBot Availability');
    try {
        const ssh = getSSHManager();
        const clawdbotPath = process.env.CLAWDBOT_PATH;
        const exists = await ssh.fileExists(clawdbotPath);
        
        if (exists) {
            console.log(`✅ ClawdBot found at ${clawdbotPath}\n`);
            testsPassed++;
        } else {
            console.error(`❌ ClawdBot not found at ${clawdbotPath}\n`);
            testsFailed++;
        }
    } catch (error) {
        console.error('❌ ClawdBot check failed:', error.message, '\n');
        testsFailed++;
    }

    // Disconnect SSH
    const ssh = getSSHManager();
    await ssh.disconnect();

    // Results
    console.log('=================================');
    console.log('Test Results:');
    console.log(`✅ Passed: ${testsPassed}`);
    if (testsFailed > 0) {
        console.log(`❌ Failed: ${testsFailed}`);
    }
    console.log(`📊 Total: ${testsPassed + testsFailed}`);
    console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('=================================\n');

    if (testsFailed === 0) {
        console.log('🎉 All tests passed! Backend is ready to deploy.\n');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Please fix the issues before deploying.\n');
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
});
