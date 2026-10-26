const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  senderName: {
    type: String,
    required: true
  },
  senderRole: {
    type: String,
    enum: ['customer', 'admin', 'agent'],
    default: 'customer'
  },
  message: {
    type: String,
    required: true
  },
  attachments: [{
    filename: String,
    originalname: String,
    path: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['Data Processing', 'Technical', 'Calibration', 'Billing', 'General Inquiry'],
    default: 'General Inquiry'
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  subtext: {
    type: String,
    trim: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['OPEN', 'IN PROGRESS', 'AWAITING CLIENT', 'RESOLVED', 'CLOSED'],
    default: 'OPEN'
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  messages: [messageSchema],
  lastActivity: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
