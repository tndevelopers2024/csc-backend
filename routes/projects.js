const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Project = require('../models/Project');

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB limit (adjust as needed for server limits, though Express usually needs special config for multi-GB)
});

// POST /api/projects
// Create a new project
router.post('/', auth, upload.fields([
  { name: 'scanFiles', maxCount: 50 },
  { name: 'referenceImages', maxCount: 50 }
]), async (req, res) => {
  try {
    const {
      title, description, appType, industry, cadOutput, 
      accuracy, partSize, turnaround, nda, useFreeHours,
      uploadMethod, links
    } = req.body;

    // Map uploaded files to schema structure
    const mapFiles = (filesArray) => {
      if (!filesArray) return [];
      return filesArray.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size
      }));
    };

    const scanFiles = mapFiles(req.files['scanFiles']);
    const referenceImages = mapFiles(req.files['referenceImages']);

    const newProject = new Project({
      userId: req.user.userId,
      title,
      description,
      appType,
      industry,
      cadOutput,
      accuracy,
      partSize,
      turnaround,
      nda,
      useFreeHours,
      uploadMethod,
      links: links ? (Array.isArray(links) ? links : [links]) : [],
      scanFiles,
      referenceImages,
      statusHistory: [{ status: 'Pending Quote' }]
    });

    const savedProject = await newProject.save();

    if (req.io) {
      req.io.to('admin').emit('newProject', savedProject);
    }

    res.status(201).json({
      message: 'Project created successfully',
      project: savedProject
    });

  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Server error while creating project' });
  }
});
// GET /api/projects/stats
// Get project statistics for the logged-in user
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Total Orders
    const totalOrders = await Project.countDocuments({ userId });
    
    // Quotes pending (Pending Quote, Quote Ready)
    const quotesPending = await Project.countDocuments({
      userId,
      status: { $in: ['Pending Quote', 'Quote Ready'] }
    });
    
    // Active projects (Approved, In Progress, Under Review)
    const activeProjects = await Project.countDocuments({
      userId,
      status: { $in: ['Approved', 'In Progress', 'Under Review'] }
    });
    
    // Completed projects
    const completed = await Project.countDocuments({
      userId,
      status: 'Completed'
    });
    
    res.json({
      totalOrders,
      quotesPending,
      activeProjects,
      completed
    });
  } catch (error) {
    console.error('Error fetching project stats:', error);
    res.status(500).json({ message: 'Server error while fetching stats' });
  }
});

// GET /api/projects
// Get all projects for the logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user.userId })
                                  .sort({ createdAt: -1 }); // newest first
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Server error while fetching projects' });
  }
});

// GET /api/projects/:id
// Get a single project by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(500).json({ message: 'Server error while fetching project' });
  }
});

// PUT /api/projects/:id/status
// Update a project's status (e.g. Approve or Request Revision)
router.put('/:id/status', auth, upload.single('poFile'), async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate status to prevent arbitrary changes by customer
    const allowedStatuses = ['Approved', 'Revision Requested', 'Rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status update' });
    }

    const project = await Project.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Only allow updating if it's currently Quote Ready, Revision Requested, or Rejected
    if (!['Quote Ready', 'Revision Requested', 'Rejected'].includes(project.status)) {
      return res.status(400).json({ message: 'Can only update status of projects that are Quote Ready, Revision Requested, or Rejected' });
    }
    
    project.status = status;
    project.statusHistory.push({ status });

    if (req.file) {
      project.poFile = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
    }

    const updatedProject = await project.save();
    
    if (req.io) {
      req.io.to('admin').emit('projectUpdated', updatedProject);
      req.io.to(updatedProject.userId.toString()).emit('projectUpdated', updatedProject);
    }

    res.json({ message: 'Status updated successfully', project: updatedProject });
  } catch (error) {
    console.error('Error updating project status:', error);
    res.status(500).json({ message: 'Server error while updating status' });
  }
});

// PUT /api/projects/:id/pay
// Mark a project's invoice as paid via PayPal
router.put('/:id/pay', auth, async (req, res) => {
  try {
    const project = await Project.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Clear poFile and billableHours to indicate payment is complete
    project.poFile = undefined;
    project.billableHours = 0;
    
    const updatedProject = await project.save();
    
    if (req.io) {
      req.io.to('admin').emit('projectUpdated', updatedProject);
      req.io.to(updatedProject.userId.toString()).emit('projectUpdated', updatedProject);
    }
    
    res.json({ message: 'Payment recorded successfully', project: updatedProject });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ message: 'Server error while recording payment' });
  }
});

// PUT /api/projects/:id/star
// Toggle star status of a project
router.put('/:id/star', auth, async (req, res) => {
  try {
    const project = await Project.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    project.isStarred = !project.isStarred;
    const updatedProject = await project.save();
    
    if (req.io) {
      req.io.to('admin').emit('projectUpdated', updatedProject);
      req.io.to(updatedProject.userId.toString()).emit('projectUpdated', updatedProject);
    }
    
    res.json({ message: 'Project star status toggled', project: updatedProject });
  } catch (error) {
    console.error('Error toggling star:', error);
    res.status(500).json({ message: 'Server error while toggling star status' });
  }
});

// POST /api/projects/:id/report-issue
// Customer reports an issue with project files
router.post('/:id/report-issue', auth, async (req, res) => {
  try {
    const { notes } = req.body;
    if (!notes || !notes.trim()) {
      return res.status(400).json({ message: 'Please provide issue notes before submitting.' });
    }

    const project = await Project.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const User = require('../models/User');
    const Ticket = require('../models/Ticket');
    const Notification = require('../models/Notification');
    const user = await User.findById(req.user.userId);

    // Generate ticket ID
    const currentYear = new Date().getFullYear();
    const prefix = `#TKT-${currentYear}-`;
    const regex = new RegExp(`^#TKT-${currentYear}-(\\d+)`);
    const latestTicket = await Ticket.findOne({ ticketId: regex }).sort({ createdAt: -1 });
    let sequence = 1;
    if (latestTicket && latestTicket.ticketId) {
      const match = latestTicket.ticketId.match(regex);
      if (match && match[1]) {
        sequence = parseInt(match[1], 10) + 1;
      }
    }
    const ticketId = `${prefix}${String(sequence).padStart(3, '0')}`;
    const senderName = user ? `${user.firstName} ${user.lastName}` : 'Customer';

    // Create a support ticket linked to this project
    const newTicket = new Ticket({
      ticketId,
      userId: req.user.userId,
      subject: `Reported Issue: ${project.title}`,
      category: 'Technical',
      description: notes.trim(),
      subtext: notes.trim().substring(0, 60),
      priority: 'High',
      status: 'OPEN',
      projectId: project._id,
      lastActivity: new Date(),
      messages: [{
        senderId: req.user.userId,
        senderName,
        senderRole: 'customer',
        message: notes.trim(),
        createdAt: new Date()
      }]
    });
    await newTicket.save();

    // Update project status to Reported and add to reportedIssues
    project.status = 'Reported';
    project.statusHistory.push({ status: 'Reported' });
    if (!project.reportedIssues) {
      project.reportedIssues = [];
    }
    project.reportedIssues.push({
      notes: notes.trim(),
      ticketId,
      reportedAt: new Date(),
      status: 'Open'
    });

    const updatedProject = await project.save();

    // Create notification
    await Notification.create({
      userId: req.user.userId,
      projectId: project._id,
      title: 'Issue Reported',
      message: `Issue reported for project "${project.title}": ${notes.trim().substring(0, 80)}`,
      type: 'PROJECT_UPDATE'
    });

    if (req.io) {
      req.io.to('admin').emit('projectUpdated', updatedProject);
      req.io.to('admin').emit('newTicket', newTicket);
      req.io.to('admin').emit('newNotification');
      req.io.to(updatedProject.userId.toString()).emit('projectUpdated', updatedProject);
    }

    res.json({
      message: 'Issue reported successfully! Our technical team has been notified.',
      project: updatedProject,
      ticket: newTicket
    });
  } catch (error) {
    console.error('Error reporting issue:', error);
    res.status(500).json({ message: 'Server error while reporting issue' });
  }
});

module.exports = router;
