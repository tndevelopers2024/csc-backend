const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const User = require('./models/User');

async function seedAdmin() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/my_database');
    
    const email = 'admin@convertscantocad.com';
    const password = 'scantocad@#2k26';

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      console.log('Admin user already exists!');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: email,
      mobilePrefix: '+1',
      mobile: '0000000000',
      country: 'United States',
      role: 'admin',
      password: hashedPassword
    });

    await adminUser.save();
    console.log('Admin user seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
