const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');
const Subscription = require('./src/models/Subscription');

async function updatePlan() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const email = "monu56410000@gmail.com";
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
        console.log('User not found');
        process.exit(1);
    }
    
    console.log('Found user:', user._id);
    
    // Update user
    await User.updateOne(
        { email },
        { 
            $set: { 
                current_plan: "starter",
                plan: "starter",
                subscription_status: "active"
            }
        }
    );
    
    // Check if subscription already exists
    let subscription = await Subscription.findOne({ 
        user_id: user._id,
        plan_id: 'starter'
    });
    
    if (!subscription) {
        // Create new subscription
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1); // 1 month from now
        
        subscription = await Subscription.create({
            user_id: user._id,
            plan_id: 'starter',
            plan_name: 'Starter Plan',
            amount: 499,
            currency: 'INR',
            status: 'active',
            current_start: startDate,
            current_end: endDate,
            next_billing_date: endDate,
            limits: {
                max_frontend: 3,
                max_backend: 2,
                features: ['custom-domain', 'ssl', '24x7-support']
            }
        });
        console.log('✅ Subscription created:', subscription._id);
    } else {
        // Update existing subscription
        await Subscription.updateOne(
            { _id: subscription._id },
            {
                $set: {
                    status: 'active',
                    current_start: new Date(),
                    current_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                }
            }
        );
        console.log('✅ Subscription updated:', subscription._id);
    }
    
    // Verify
    const updatedUser = await User.findOne({ email });
    const userSubscription = await Subscription.findOne({ user_id: user._id, status: 'active' });
    
    console.log('\n✅ Final Status:');
    console.log('User Plan:', updatedUser.current_plan);
    console.log('Subscription Status:', updatedUser.subscription_status);
    console.log('Active Subscription:', userSubscription ? userSubscription.plan_id : 'None');
    
    await mongoose.connection.close();
    process.exit(0);
}

updatePlan().catch(console.error);