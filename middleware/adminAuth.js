const User = require('../models/User');

module.exports = async function(req, res, next) {
  try {
    // req.user is populated by the auth middleware
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(req.user.userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    next();
  } catch (err) {
    console.error('Error in admin auth middleware:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
