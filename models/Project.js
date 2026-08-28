const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  appType: {
    type: String
  },
  industry: {
    type: String
  },
  cadOutput: {
    type: String
  },
  accuracy: {
    type: String
  },
  partSize: {
    type: String
  },
  turnaround: {
    type: String
  },
  nda: {
    type: String
  },
  useFreeHours: {
    type: String
  },
  scanFiles: [{
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number
  }],
  referenceImages: [{
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number
  }],
  status: {
    type: String,
    enum: ['Pending Quote', 'Quote Ready', 'Approved', 'In Progress', 'Under Review', 'Completed', 'Cancelled'],
    default: 'Pending Quote'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Project', projectSchema);
