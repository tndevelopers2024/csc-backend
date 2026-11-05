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
  uploadMethod: {
    type: String,
    enum: ['Upload', 'Link'],
    default: 'Upload'
  },
  links: [{
    type: String
  }],
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
  quotationFiles: [{
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number
  }],
  poFile: {
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number
  },
  completedFiles: [{
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number
  }],
  invoiceFiles: [{
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number
  }],
  estimatedHours: {
    type: Number,
    default: 0
  },
  fileEstimatedHours: [{
    type: Number
  }],
  freeHoursApplied: {
    type: Number,
    default: 0
  },
  billableHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Pending Quote', 'Quote Ready', 'Approved', 'In Progress', 'QA Review', 'Delivered', 'Under Review', 'Completed', 'Cancelled', 'Requested', 'Quoted', 'Rejected', 'Revision Requested', 'Ongoing', 'Reported'],
    default: 'Pending Quote'
  },
  revisionRequest: {
    reason: {
      type: String
    },
    description: {
      type: String
    },
    requestedAt: {
      type: Date,
      default: Date.now
    }
  },
  revisionHistory: [{
    reason: {
      type: String
    },
    description: {
      type: String
    },
    requestedAt: {
      type: Date,
      default: Date.now
    }
  }],
  reportedIssues: [{
    notes: {
      type: String,
      required: true
    },
    ticketId: {
      type: String
    },
    reportedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Open', 'Under Review', 'Resolved'],
      default: 'Open'
    }
  }],
  statusHistory: [{
    status: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  couponCode: {
    type: String,
    trim: true
  },
  couponApplied: {
    code: String,
    hours: Number,
    hoursApplied: Number,
    hoursRetained: Number,
    discountType: String,
    discountValue: Number,
    discountAmount: Number,
    originalAmount: Number,
    finalAmount: Number
  },
  paymentDeadline: {
    type: Date
  },
  isStarred: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Project', projectSchema);
