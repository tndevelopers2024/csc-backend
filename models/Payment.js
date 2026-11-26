const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gateway: {
    type: String,
    enum: ['razorpay', 'paypal'],
    required: true
  },
  purpose: {
    type: String,
    enum: ['buy_hours', 'project_invoice'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  hours: {
    type: Number
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  projectIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  orderId: {
    type: String
  },
  paymentId: {
    type: String
  },
  status: {
    type: String,
    enum: ['created', 'completed', 'failed'],
    default: 'completed'
  },
  meta: {
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
