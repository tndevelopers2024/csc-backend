const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Project = require('../models/Project');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const sendNotificationEmail = require('../utils/mailer');

// Helper to email coupon details to a customer
const sendCouponEmail = async (user, coupon) => {
  const expiresStr = coupon.expiresAt 
    ? new Date(coupon.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Does not expire';

  const subject = `Your Exclusive CAD Hours Coupon: ${coupon.code} - ConvertScanToCAD`;
  const text = `Hello ${user.firstName},\n\nYou have received an exclusive one-time CAD coupon: ${coupon.code}\nValue: ${coupon.hours} CAD Hours ($${coupon.hours * 50} USD value)\nExpiration: ${expiresStr}\n\nYou can use this coupon code when creating a new project or during quotation approval.\nAny unused hours from this coupon will be retained in your account balance!\n\nBest regards,\nThe ConvertScanToCAD Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #1e293b; font-size: 22px; margin: 0; font-weight: 800;">ConvertScanToCAD</h1>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Exclusive Promotion</p>
      </div>
      
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello <strong>${user.firstName}</strong>,</p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        You have been granted an exclusive one-time <strong>CAD Hours Coupon</strong> by our administration team!
      </p>

      <div style="background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0;">
        <div style="font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Your Coupon Code</div>
        <div style="font-size: 30px; font-weight: 800; font-family: monospace; color: #15803d; letter-spacing: 2px; margin-bottom: 8px;">${coupon.code}</div>
        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${coupon.hours} CAD Hours Free</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Standard value: $${coupon.hours * 50} USD (@ $50/hr)</div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; font-size: 13px; color: #334155;">
        <p style="margin: 0 0 8px 0;"><strong>Validity:</strong> Strictly one-time use</p>
        <p style="margin: 0 0 8px 0;"><strong>Expiration:</strong> ${expiresStr}</p>
        ${coupon.description ? `<p style="margin: 0 0 8px 0;"><strong>Note:</strong> ${coupon.description}</p>` : ''}
        <p style="margin: 0; color: #0284c7;"><strong>★ Hours Retention:</strong> If your project uses fewer hours than this coupon, the remaining hours will be automatically retained in your account balance for future projects!</p>
      </div>

      <h4 style="color: #1e293b; font-size: 14px; margin: 0 0 8px 0;">How to use your coupon:</h4>
      <ol style="color: #475569; font-size: 13px; line-height: 1.6; padding-left: 20px; margin: 0 0 24px 0;">
        <li>Enter <strong>${coupon.code}</strong> in the coupon code field when creating a new CAD project.</li>
        <li>Or apply it in your quotation approval modal to cover your project billable hours.</li>
        <li>Or redeem it directly on your Billing Overview page to credit hours to your balance.</li>
      </ol>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="https://convertscantocad.com/login" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px;">
          Go to Your Dashboard
        </a>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
        ConvertScanToCAD • Professional Scan to CAD Conversion Services
      </div>
    </div>
  `;

  try {
    await sendNotificationEmail(user.email, subject, text, html);
    return true;
  } catch (err) {
    console.error('Failed to send coupon email:', err);
    return false;
  }
};

// -------------------------------------------------------------
// CUSTOMER ENDPOINTS
// -------------------------------------------------------------

// @route   GET /api/coupons/my-available
// @desc    Get current user's available (unused, unexpired) coupons
// @access  Private (User)
router.get('/my-available', auth, async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      userId: req.user.userId,
      isUsed: false,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    }).sort({ createdAt: -1 });

    res.json(coupons);
  } catch (err) {
    console.error('Error fetching available coupons:', err);
    res.status(500).json({ message: 'Server error fetching coupons' });
  }
});

// @route   POST /api/coupons/validate
// @desc    Validate a coupon code for the user and preview discount on a project
// @access  Private (User)
router.post('/validate', auth, async (req, res) => {
  try {
    const { code, projectId } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode });

    if (!coupon) {
      return res.status(404).json({ message: 'Invalid coupon code' });
    }

    // Check if this coupon belongs to the requesting user
    if (coupon.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ message: 'This coupon is not valid for your account' });
    }

    // Check if already used (strict one-time use)
    if (coupon.isUsed) {
      return res.status(400).json({ 
        message: `This coupon has already been used on ${coupon.usedAt ? new Date(coupon.usedAt).toLocaleDateString('en-GB') : 'a previous project'}` 
      });
    }

    // Check expiration
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This coupon has expired' });
    }

    const couponHours = Number(coupon.hours || coupon.discountValue || 0);
    let originalAmount = 0;
    let projectBillableHours = 0;
    let hoursApplied = 0;
    let hoursRetained = couponHours;
    let discountAmount = 0;
    let finalAmount = 0;

    if (projectId) {
      const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
      if (project) {
        projectBillableHours = project.billableHours || 0;
        originalAmount = projectBillableHours * 50;
        // Apply coupon hours directly against project billable hours
        hoursApplied = Math.min(couponHours, projectBillableHours);
        hoursRetained = Math.max(0, Math.round((couponHours - hoursApplied) * 100) / 100);
        discountAmount = Math.round(hoursApplied * 50 * 100) / 100;
        finalAmount = Math.max(0, Math.round((originalAmount - discountAmount) * 100) / 100);
      }
    } else {
      hoursApplied = 0;
      hoursRetained = couponHours;
      discountAmount = couponHours * 50;
    }

    res.json({
      valid: true,
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        hours: couponHours,
        description: coupon.description
      },
      projectBillableHours,
      hoursApplied,
      hoursRetained,
      originalAmount,
      discountAmount,
      finalAmount
    });
  } catch (err) {
    console.error('Error validating coupon:', err);
    res.status(500).json({ message: 'Server error while validating coupon' });
  }
});

// @route   POST /api/coupons/redeem
// @desc    Redeem a one-time coupon and apply it to a project (retaining any unused hours for the customer)
// @access  Private (User)
router.post('/redeem', auth, async (req, res) => {
  try {
    const { code, projectId } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode });

    if (!coupon) {
      return res.status(404).json({ message: 'Invalid coupon code' });
    }

    if (coupon.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ message: 'This coupon is not assigned to your account' });
    }

    if (coupon.isUsed) {
      return res.status(400).json({ message: 'This coupon has already been used' });
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This coupon has expired' });
    }

    const couponHours = Number(coupon.hours || coupon.discountValue || 0);
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let project = null;
    let hoursApplied = 0;
    let hoursRetained = couponHours;
    let originalAmount = 0;
    let discountAmount = 0;
    let finalAmount = 0;

    if (projectId) {
      project = await Project.findOne({ _id: projectId, userId: req.user.userId });
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      const projectBillableHours = project.billableHours || 0;
      originalAmount = projectBillableHours * 50;
      hoursApplied = Math.min(couponHours, projectBillableHours);
      hoursRetained = Math.max(0, Math.round((couponHours - hoursApplied) * 100) / 100);
      discountAmount = Math.round(hoursApplied * 50 * 100) / 100;
      finalAmount = Math.max(0, Math.round((originalAmount - discountAmount) * 100) / 100);

      // Store coupon details on project
      project.couponApplied = {
        code: coupon.code,
        hours: couponHours,
        hoursApplied,
        hoursRetained,
        discountAmount,
        originalAmount,
        finalAmount
      };
      await project.save();
    }

    // Retain any remaining/unused coupon hours for the customer in freeHoursRemaining
    if (hoursRetained > 0) {
      user.freeHoursRemaining = Math.round(((user.freeHoursRemaining || 0) + hoursRetained) * 100) / 100;
      await user.save();
    }

    // Mark coupon as used (strictly one-time use)
    coupon.isUsed = true;
    coupon.usedAt = new Date();
    coupon.hoursApplied = hoursApplied;
    coupon.hoursRetained = hoursRetained;
    if (project) {
      coupon.usedInProjectId = project._id;
    }
    await coupon.save();

    // Socket update
    if (req.io) {
      if (project) {
        req.io.to('admin').emit('projectUpdated', project);
        req.io.to(user._id.toString()).emit('projectUpdated', project);
      }
      req.io.to(user._id.toString()).emit('userUpdated', user);
    }

    res.json({
      message: hoursRetained > 0
        ? `Coupon '${coupon.code}' redeemed! ${hoursApplied} hr(s) applied to project, and ${hoursRetained} hr(s) retained in your account balance.`
        : `Coupon '${coupon.code}' redeemed successfully! ${hoursApplied} hr(s) applied to project.`,
      project,
      coupon,
      userFreeHoursRemaining: user.freeHoursRemaining,
      hoursApplied,
      hoursRetained
    });
  } catch (err) {
    console.error('Error redeeming coupon:', err);
    res.status(500).json({ message: 'Server error redeeming coupon' });
  }
});

// -------------------------------------------------------------
// ADMIN ENDPOINTS
// -------------------------------------------------------------

// @route   GET /api/coupons/admin/user/:userId
// @desc    Get all coupons created for a specific user
// @access  Admin
router.get('/admin/user/:userId', auth, adminAuth, async (req, res) => {
  try {
    const coupons = await Coupon.find({ userId: req.params.userId })
      .populate('usedInProjectId', 'title')
      .sort({ createdAt: -1 });

    res.json(coupons);
  } catch (err) {
    console.error('Error fetching user coupons:', err);
    res.status(500).json({ message: 'Server error fetching user coupons' });
  }
});

// @route   POST /api/coupons/admin
// @desc    Admin sets a new one-time CAD hours coupon for a particular user
// @access  Admin
router.post('/admin', auth, adminAuth, async (req, res) => {
  try {
    const { userId, code, hours, description, expiresAt, sendEmail = true } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }
    const numHours = Number(hours);
    if (!numHours || numHours <= 0) {
      return res.status(400).json({ message: 'A valid number of hours (greater than 0) is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Selected user does not exist' });
    }

    const cleanCode = code.trim().toUpperCase();

    // Check if code already exists
    const existing = await Coupon.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ message: `Coupon code '${cleanCode}' already exists. Please use a unique code.` });
    }

    const newCoupon = new Coupon({
      code: cleanCode,
      userId,
      hours: numHours,
      description: description?.trim() || '',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: req.user.userId,
      isUsed: false
    });

    await newCoupon.save();

    if (req.io) {
      req.io.to(userId.toString()).emit('couponAssigned', newCoupon);
    }

    let emailSent = false;
    if (sendEmail && user.email) {
      emailSent = await sendCouponEmail(user, newCoupon);
    }

    res.status(201).json({
      message: `One-time coupon '${cleanCode}' (${numHours} hrs) successfully assigned to ${user.firstName} ${user.lastName}${emailSent ? ' and shared via email' : ''}!`,
      coupon: newCoupon,
      emailSent
    });
  } catch (err) {
    console.error('Error creating coupon:', err);
    res.status(500).json({ message: 'Server error creating coupon' });
  }
});

// @route   POST /api/coupons/admin/:id/send-email
// @desc    Admin manually shares/sends coupon code to user via email
// @access  Admin
router.post('/admin/:id/send-email', auth, adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    const user = await User.findById(coupon.userId);
    if (!user || !user.email) {
      return res.status(404).json({ message: 'User or email address not found' });
    }

    await sendCouponEmail(user, coupon);

    res.json({ message: `Coupon '${coupon.code}' successfully sent to ${user.email}!` });
  } catch (err) {
    console.error('Error sending coupon email:', err);
    res.status(500).json({ message: 'Server error sending coupon email' });
  }
});

// @route   DELETE /api/coupons/admin/:id
// @desc    Delete an unused coupon
// @access  Admin
router.delete('/admin/:id', auth, adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    if (coupon.isUsed) {
      return res.status(400).json({ message: 'Cannot delete a coupon that has already been redeemed' });
    }

    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted successfully' });
  } catch (err) {
    console.error('Error deleting coupon:', err);
    res.status(500).json({ message: 'Server error deleting coupon' });
  }
});

module.exports = router;

