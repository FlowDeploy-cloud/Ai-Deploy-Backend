// MongoDB Setup Script for ClawDeploy

/*
 * MongoDB doesn't require explicit schema creation like PostgreSQL.
 * The schemas are defined in the Mongoose models.
 * 
 * However, you can run this script to:
 * 1. Create indexes for better performance
 * 2. Set up initial admin user (optional)
 * 3. Seed test data (optional)
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');
const Deployment = require('./src/models/Deployment');
const DeploymentLog = require('./src/models/DeploymentLog');

async function setupDatabase() {
    try {
        console.log('🔧 Setting up MongoDB for ClawDeploy...\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB\n');

        // Create indexes (Mongoose does this automatically, but we can force it)
        console.log('📑 Creating indexes...');
        await User.createIndexes();
        await Deployment.createIndexes();
        await DeploymentLog.createIndexes();
        console.log('✅ Indexes created\n');

        // Optional: Create admin user
        console.log('👤 Checking for admin user...');
        const adminEmail = 'admin@clawdeploy.com';
        const existingAdmin = await User.findByEmail(adminEmail);

        if (!existingAdmin) {
            const admin = await User.create({
                username: 'admin',
                email: adminEmail,
                password: 'Admin@123456',
                plan: 'enterprise'
            });
            console.log('✅ Admin user created');
            console.log(`   Email: ${adminEmail}`);
            console.log(`   Password: Admin@123456`);
            console.log(`   API Key: ${admin.api_key}\n`);
        } else {
            console.log('ℹ️  Admin user already exists\n');
        }

        // Show database stats
        console.log('📊 Database Statistics:');
        const userCount = await User.countDocuments();
        const deploymentCount = await Deployment.countDocuments();
        const logCount = await DeploymentLog.countDocuments();
        console.log(`   Users: ${userCount}`);
        console.log(`   Deployments: ${deploymentCount}`);
        console.log(`   Logs: ${logCount}\n`);

        console.log('✅ Database setup complete!\n');

        // Close connection
        await mongoose.connection.close();
        console.log('🔌 Connection closed');
        process.exit(0);

    } catch (error) {
        console.error('❌ Database setup failed:', error);
        process.exit(1);
    }
}

// Run setup
setupDatabase();
