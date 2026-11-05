const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hours: {
    type: Number,
    required: true,
    min: 0.1
  },
  hoursApplied: {
    type: Number,
    default: 0
  },
  hoursRetained: {
    type: Number,
    default: 0
  },
  // Retain legacy fields as optional if needed
  discountType: {
    type: String,
    default: 'hours'
  },
  discountValue: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date
  },
  usedInProjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  expiresAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Coupon', couponSchema);

