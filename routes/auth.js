const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a user
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, mobilePrefix, mobile, country, role, password } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    user = new User({
      firstName,
      lastName,
      email,
      mobilePrefix,
      mobile,
      country,
      role,
      password: hashedPassword
    });

    await user.save();

    // Create JWT
    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Exclude password from the returned user object
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({ token, user: userResponse, message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Login a user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT
    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Exclude password from the returned user object
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ token, user: userResponse, message: 'Login successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching user' });
  }
});

// @route   PUT /api/auth/preferences
// @desc    Update user notification preferences
router.put('/preferences', auth, async (req, res) => {
  try {
    const { platformPrefs } = req.body;
    
    let user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.notificationPreferences = {
      ...user.notificationPreferences.toObject(),
      ...platformPrefs
    };

    await user.save();
    res.json({ message: 'Preferences updated successfully', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error updating preferences' });
  }
});

const crypto = require('crypto');
const sendNotificationEmail = require('../utils/mailer');

// @route   POST /api/auth/forgot-password
// @desc    Send password reset OTP and link
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }

    // Generate 6-digit OTP code and a token
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetToken = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    user.resetPasswordOtp = otp;
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = expires;
    await user.save();

    // Send email with OTP and direct reset link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    const emailSubject = 'Password Reset Code - ConvertScanToCAD';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e3a8a; margin: 0;">ConvertScanToCAD</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Password Reset Request</p>
        </div>
        <p style="font-size: 15px; color: #334155;">Hello ${user.firstName || 'there'},</p>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          We received a request to reset your ConvertScanToCAD account password. Use the verification code below to reset your password:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 14px 28px; background-color: #eff6ff; color: #2563eb; border: 1px dashed #93c5fd; border-radius: 8px;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 13px; color: #64748b; text-align: center; margin-bottom: 24px;">
          This code is valid for <strong>15 minutes</strong>.
        </p>
        <div style="text-align: center; margin-bottom: 28px;">
          <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Or click below to reset directly on our website:</p>
          <a href="${resetLink}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 6px;">
            Reset Password
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          If you did not request a password reset, you can safely ignore this email. Your account remains secure.
        </p>
      </div>
    `;

    await sendNotificationEmail(
      user.email,
      emailSubject,
      `Your ConvertScanToCAD password reset code is: ${otp}. It expires in 15 minutes.`,
      emailHtml
    );

    res.json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('Error in forgot-password:', error);
    res.status(500).json({ message: 'Server error sending password reset code.' });
  }
});

// @route   POST /api/auth/verify-reset-code
// @desc    Verify OTP code
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required.' });
    }

    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      resetPasswordOtp: code.trim(),
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    res.json({ message: 'Code verified successfully.' });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ message: 'Server error verifying code.' });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password using OTP code or token
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, token, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    let query = {
      resetPasswordExpires: { $gt: new Date() }
    };

    if (token) {
      query.resetPasswordToken = token;
    } else if (email && code) {
      query.email = email.toLowerCase().trim();
      query.resetPasswordOtp = code.trim();
    } else {
      return res.status(400).json({ message: 'Missing verification code or token.' });
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset code or link.' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Clear reset fields
    user.resetPasswordOtp = undefined;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Send confirmation email
    sendNotificationEmail(
      user.email,
      'Your Password Has Been Changed - ConvertScanToCAD',
      'Your password for ConvertScanToCAD was successfully reset.',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #1e3a8a; margin: 0 0 16px 0;">ConvertScanToCAD</h2>
          <p style="font-size: 15px; color: #334155;">Hello ${user.firstName || 'there'},</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            This is a confirmation that your account password has been successfully reset. You can now log in using your new password.
          </p>
          <p style="font-size: 13px; color: #dc2626; margin-top: 20px;">
            If you did not perform this change, please reach out to our support team immediately.
          </p>
        </div>
      `
    ).catch(() => {});

    res.json({ message: 'Password has been reset successfully! You can now log in.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Server error while resetting password.' });
  }
});

module.exports = router;
