const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobilePrefix: { type: String, required: true },
  mobile: { type: String, required: true },
  country: { type: String, required: true },
  role: { type: String, required: true },
  password: { type: String, required: true },
  freeHoursRemaining: { type: Number, default: 3 },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
