const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

// Helper function to generate ticket ID
const generateTicketId = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `#TKT-${currentYear}-`;
  
  // Find highest sequence for this year
  const regex = new RegExp(`^#TKT-${currentYear}-(\\d+)`);
  const latestTicket = await Ticket.findOne({ ticketId: regex }).sort({ createdAt: -1 });

  let sequence = 1;
  if (latestTicket && latestTicket.ticketId) {
    const match = latestTicket.ticketId.match(regex);
    if (match && match[1]) {
      sequence = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
};

// @route   GET /api/tickets/my-tickets
// @desc    Get tickets and metrics for the logged-in customer
router.get('/my-tickets', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, sort } = req.query;

    let query = { userId };

    if (status && status !== 'all') {
      if (status.toLowerCase() === 'open') {
        query.status = { $in: ['OPEN', 'IN PROGRESS', 'AWAITING CLIENT'] };
      } else if (status.toLowerCase() === 'resolved') {
        query.status = { $in: ['RESOLVED', 'CLOSED'] };
      } else {
        query.status = status.toUpperCase();
      }
    }

    const sortOption = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const tickets = await Ticket.find(query).sort(sortOption);

    // Calculate overall stats for this user across all tickets
    const allUserTickets = await Ticket.find({ userId });
    const totalTickets = allUserTickets.length;
    const openTickets = allUserTickets.filter(t => ['OPEN', 'IN PROGRESS', 'AWAITING CLIENT'].includes(t.status)).length;
    const awaitingReplyTickets = allUserTickets.filter(t => t.status === 'AWAITING CLIENT').length;

    res.json({
      tickets,
      stats: {
        totalTickets,
        openTickets,
        awaitingReplyTickets
      }
    });
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ message: 'Server error fetching tickets' });
  }
});

// @route   POST /api/tickets
// @desc    Create a new support ticket
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    const { subject, category, description, subtext, priority, projectId } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: 'Subject and description are required' });
    }

    const ticketId = await generateTicketId();
    const senderName = user ? `${user.firstName} ${user.lastName}` : 'Customer';

    const newTicket = new Ticket({
      ticketId,
      userId,
      subject,
      category: category || 'General Inquiry',
      description,
      subtext: subtext || description.substring(0, 60),
      priority: priority || 'Medium',
      status: 'OPEN',
      projectId: projectId || undefined,
      lastActivity: new Date(),
      messages: [{
        senderId: userId,
        senderName,
        senderRole: 'customer',
        message: description,
        createdAt: new Date()
      }]
    });

    await newTicket.save();

    if (req.io) {
      req.io.to('admin').emit('newTicket', newTicket);
    }

    res.status(201).json(newTicket);
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ message: 'Server error creating ticket' });
  }
});

// @route   GET /api/tickets/:id
// @desc    Get single ticket with full details
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      userId: req.user.userId
    }).populate('projectId', 'title status');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error fetching ticket detail:', err);
    res.status(500).json({ message: 'Server error fetching ticket' });
  }
});

// @route   POST /api/tickets/:id/reply
// @desc    Post a reply message to a ticket
router.post('/:id/reply', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Reply message cannot be empty' });
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const user = await User.findById(req.user.userId);
    const senderName = user ? `${user.firstName} ${user.lastName}` : 'Customer';

    const newReply = {
      senderId: req.user.userId,
      senderName,
      senderRole: 'customer',
      message: message.trim(),
      createdAt: new Date()
    };

    ticket.messages.push(newReply);
    ticket.lastActivity = new Date();
    // If ticket was awaiting client or resolved, customer reply moves it back to OPEN / IN PROGRESS
    if (ticket.status === 'AWAITING CLIENT' || ticket.status === 'RESOLVED') {
      ticket.status = 'IN PROGRESS';
    }

    await ticket.save();

    if (req.io) {
      req.io.to('admin').emit('ticketReply', { ticketId: ticket._id, reply: newReply });
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error replying to ticket:', err);
    res.status(500).json({ message: 'Server error replying to ticket' });
  }
});

// @route   PATCH /api/tickets/:id/status
// @desc    Update ticket status (e.g., mark as RESOLVED or OPEN)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.status = status;
    ticket.lastActivity = new Date();
    await ticket.save();

    res.json(ticket);
  } catch (err) {
    console.error('Error updating ticket status:', err);
    res.status(500).json({ message: 'Server error updating ticket status' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// @route   GET /api/tickets/admin/all
// @desc    Get all tickets across all customers with stats
router.get('/admin/all', auth, adminAuth, async (req, res) => {
  try {
    const { status, category, search, sort } = req.query;

    let query = {};

    if (status && status !== 'All') {
      if (status.toLowerCase() === 'open') {
        query.status = { $in: ['OPEN', 'IN PROGRESS'] };
      } else if (status.toLowerCase() === 'awaiting client' || status.toLowerCase() === 'awaiting') {
        query.status = 'AWAITING CLIENT';
      } else if (status.toLowerCase() === 'resolved') {
        query.status = { $in: ['RESOLVED', 'CLOSED'] };
      } else {
        query.status = status.toUpperCase();
      }
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { ticketId: { $regex: s, $options: 'i' } },
        { subject: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
        { subtext: { $regex: s, $options: 'i' } }
      ];
    }

    const sortOption = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const tickets = await Ticket.find(query)
      .populate('userId', 'firstName lastName email mobile role')
      .populate('projectId', 'title status')
      .sort(sortOption);

    // Calculate global stats
    const allTickets = await Ticket.find({});
    const total = allTickets.length;
    const open = allTickets.filter(t => ['OPEN', 'IN PROGRESS'].includes(t.status)).length;
    const awaitingClient = allTickets.filter(t => t.status === 'AWAITING CLIENT').length;
    const resolved = allTickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status)).length;

    res.json({
      tickets,
      stats: {
        total,
        open,
        awaitingClient,
        resolved
      }
    });
  } catch (err) {
    console.error('Error fetching admin tickets:', err);
    res.status(500).json({ message: 'Server error fetching tickets' });
  }
});

// @route   GET /api/tickets/admin/:id
// @desc    Get single ticket details for admin
router.get('/admin/:id', auth, adminAuth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('userId', 'firstName lastName email mobile role')
      .populate('projectId', 'title status');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error fetching ticket detail for admin:', err);
    res.status(500).json({ message: 'Server error fetching ticket' });
  }
});

// @route   POST /api/tickets/admin/:id/reply
// @desc    Admin reply to a customer ticket
router.post('/admin/:id/reply', auth, adminAuth, async (req, res) => {
  try {
    const { message, status } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Reply message cannot be empty' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const adminUser = await User.findById(req.user.userId);
    const senderName = adminUser ? `${adminUser.firstName} ${adminUser.lastName} (Support)` : 'ConvertScanToCAD Support';

    const newReply = {
      senderId: req.user.userId,
      senderName,
      senderRole: 'agent',
      message: message.trim(),
      createdAt: new Date()
    };

    ticket.messages.push(newReply);
    ticket.lastActivity = new Date();

    if (status) {
      ticket.status = status;
    } else {
      ticket.status = 'AWAITING CLIENT';
    }

    await ticket.save();

    if (req.io) {
      req.io.to(ticket.userId.toString()).emit('ticketReply', { ticketId: ticket._id, reply: newReply });
      req.io.to('admin').emit('ticketUpdated', ticket);
    }

    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('userId', 'firstName lastName email mobile role')
      .populate('projectId', 'title status');

    res.json(populatedTicket);
  } catch (err) {
    console.error('Error in admin ticket reply:', err);
    res.status(500).json({ message: 'Server error replying to ticket' });
  }
});

// @route   PATCH /api/tickets/admin/:id/status
// @desc    Admin update ticket status / priority
router.patch('/admin/:id/status', auth, adminAuth, async (req, res) => {
  try {
    const { status, priority } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    ticket.lastActivity = new Date();

    await ticket.save();

    if (req.io) {
      req.io.to(ticket.userId.toString()).emit('ticketStatusChanged', { ticketId: ticket._id, status: ticket.status });
      req.io.to('admin').emit('ticketUpdated', ticket);
    }

    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('userId', 'firstName lastName email mobile role')
      .populate('projectId', 'title status');

    res.json(populatedTicket);
  } catch (err) {
    console.error('Error updating ticket status from admin:', err);
    res.status(500).json({ message: 'Server error updating ticket' });
  }
});

module.exports = router;
