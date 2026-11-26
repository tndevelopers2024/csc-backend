const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Project = require('../models/Project');
const Payment = require('../models/Payment');

const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_9prjSZS0QLvGyK',
    key_secret: process.env.RAZORPAY_SECRET || 'lY6pVLe1IEOJ49gHHbzHvLGr',
  });
};

// GET /api/payments/config
// Return public keys for Razorpay & PayPal
router.get('/config', (req, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_9prjSZS0QLvGyK',
    paypalClientId: process.env.PAYPAL_CLIENT_ID || 'ASJQyCyGK6uKYaMMyOXb1wXXW1Q4OEcSJfxV_xYzXlccJZ-efkhFTtgim2mECDU4qZRtajbrkJBtqifY'
  });
});

// POST /api/payments/razorpay/create-order
// Create Razorpay order for Buy Hours or Invoice Payment
router.post('/razorpay/create-order', auth, async (req, res) => {
  try {
    const { amount, currency = 'USD', receipt } = req.body;
    
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'A valid payment amount is required' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_9prjSZS0QLvGyK';
    const keySecret = process.env.RAZORPAY_SECRET || 'lY6pVLe1IEOJ49gHHbzHvLGr';

    if (!keyId || !keySecret) {
      return res.status(500).json({ 
        message: 'Razorpay API keys are missing on the server. Please check backend/.env.' 
      });
    }

    const razorpay = getRazorpayInstance();
    // Razorpay amount is in currency sub-units (e.g. cents/paise)
    const options = {
      amount: Math.round(Number(amount) * 100),
      currency: currency.toUpperCase(),
      receipt: receipt || `rec_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error('Razorpay create-order error:', err);
    const statusCode = err?.statusCode || 500;
    const desc = err?.error?.description || err?.description || err?.message || 'Failed to create Razorpay order';
    
    let userFriendlyMessage = desc;
    if (statusCode === 401 || desc.includes('Authentication failed')) {
      userFriendlyMessage = 'Razorpay Authentication Failed: The RAZORPAY_KEY_ID or RAZORPAY_SECRET in backend/.env is invalid or expired. Please verify or regenerate your API keys in the Razorpay Dashboard (Settings > API Keys).';
    }

    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ 
      message: userFriendlyMessage, 
      details: desc,
      statusCode
    });
  }
});

// POST /api/payments/razorpay/verify
// Verify signature and fulfill payment
router.post('/razorpay/verify', auth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      purpose, // 'buy_hours' | 'project_invoice'
      projectId,
      projectIds,
      hours,
      amount,
      currency = 'USD'
    } = req.body;

    const secret = process.env.RAZORPAY_SECRET || 'lY6pVLe1IEOJ49gHHbzHvLGr';
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid payment signature. Verification failed.' });
    }

    // Save payment log
    await Payment.create({
      userId: req.user.userId,
      gateway: 'razorpay',
      purpose: purpose || 'buy_hours',
      amount: Number(amount) || 0,
      currency,
      hours: Number(hours) || 0,
      projectId: projectId || null,
      projectIds: projectIds || (projectId ? [projectId] : []),
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      status: 'completed'
    });

    // Fulfill based on purpose
    if (purpose === 'buy_hours') {
      const user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const addedHours = Number(hours) || 1;
      user.freeHoursRemaining = Math.round(((user.freeHoursRemaining || 0) + addedHours) * 100) / 100;
      await user.save();

      if (req.io) {
        req.io.to(user._id.toString()).emit('userUpdated', user);
      }

      return res.json({
        success: true,
        message: `${addedHours} CAD Hours successfully added to your account!`,
        user
      });
    }

    if (purpose === 'project_invoice') {
      const ids = projectIds || (projectId ? [projectId] : []);
      const updatedProjects = [];

      for (const id of ids) {
        const project = await Project.findOne({ _id: id, userId: req.user.userId });
        if (project) {
          project.poFile = undefined;
          project.billableHours = 0;
          const saved = await project.save();
          updatedProjects.push(saved);

          if (req.io) {
            req.io.to('admin').emit('projectUpdated', saved);
            req.io.to(saved.userId.toString()).emit('projectUpdated', saved);
          }
        }
      }

      return res.json({
        success: true,
        message: 'Invoice payment recorded successfully',
        projects: updatedProjects
      });
    }

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (err) {
    console.error('Razorpay verify error:', err);
    res.status(500).json({ message: 'Error verifying payment', error: err.message });
  }
});

// POST /api/payments/paypal/record
// Record and fulfill PayPal payment
router.post('/paypal/record', auth, async (req, res) => {
  try {
    const {
      orderId,
      purpose, // 'buy_hours' | 'project_invoice'
      projectId,
      projectIds,
      hours,
      amount,
      currency = 'USD',
      details
    } = req.body;

    // Save payment log
    await Payment.create({
      userId: req.user.userId,
      gateway: 'paypal',
      purpose: purpose || 'buy_hours',
      amount: Number(amount) || 0,
      currency,
      hours: Number(hours) || 0,
      projectId: projectId || null,
      projectIds: projectIds || (projectId ? [projectId] : []),
      orderId: orderId || details?.id,
      paymentId: details?.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderId,
      status: 'completed',
      meta: details
    });

    if (purpose === 'buy_hours') {
      const user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const addedHours = Number(hours) || 1;
      user.freeHoursRemaining = Math.round(((user.freeHoursRemaining || 0) + addedHours) * 100) / 100;
      await user.save();

      if (req.io) {
        req.io.to(user._id.toString()).emit('userUpdated', user);
      }

      return res.json({
        success: true,
        message: `${addedHours} CAD Hours successfully added to your account!`,
        user
      });
    }

    if (purpose === 'project_invoice') {
      const ids = projectIds || (projectId ? [projectId] : []);
      const updatedProjects = [];

      for (const id of ids) {
        const project = await Project.findOne({ _id: id, userId: req.user.userId });
        if (project) {
          project.poFile = undefined;
          project.billableHours = 0;
          const saved = await project.save();
          updatedProjects.push(saved);

          if (req.io) {
            req.io.to('admin').emit('projectUpdated', saved);
            req.io.to(saved.userId.toString()).emit('projectUpdated', saved);
          }
        }
      }

      return res.json({
        success: true,
        message: 'Invoice payment recorded successfully',
        projects: updatedProjects
      });
    }

    res.json({ success: true, message: 'PayPal payment processed successfully' });
  } catch (err) {
    console.error('PayPal record error:', err);
    res.status(500).json({ message: 'Error recording PayPal payment', error: err.message });
  }
});

module.exports = router;
