const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// Get all notifications for the logged in user
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Mark a single notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    let notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }
    
    // Make sure user owns notification
    if (notification.userId.toString() !== req.user.userId) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    
    notification.isRead = true;
    await notification.save();
    
    if (req.io) {
      req.io.to(req.user.userId).emit('notificationsUpdated');
    }

    res.json(notification);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Mark all notifications as read
router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.userId, isRead: false },
      { $set: { isRead: true } }
    );
    
    if (req.io) {
      req.io.to(req.user.userId).emit('notificationsUpdated');
    }

    res.json({ msg: 'All notifications marked as read' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
