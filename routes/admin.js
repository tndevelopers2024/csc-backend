const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Project = require('../models/Project');
const User = require('../models/User');
const Rate = require('../models/Rate');

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
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }
});

// Apply auth and adminAuth middleware to all routes in this file
router.use(auth, adminAuth);

// GET /api/admin/projects/stats
// Get project statistics across all users
router.get('/projects/stats', async (req, res) => {
  try {
    const totalQuotations = await Project.countDocuments();
    
    const requested = await Project.countDocuments({ status: { $in: ['Requested', 'Pending Quote'] } });
    const quoted = await Project.countDocuments({ status: { $in: ['Quoted', 'Quote Ready'] } });
    const approved = await Project.countDocuments({ status: 'Approved' });
    const rejected = await Project.countDocuments({ status: 'Rejected' });
    const ongoing = await Project.countDocuments({ status: { $in: ['Ongoing', 'In Progress'] } });
    const reported = await Project.countDocuments({ status: 'Reported' });
    const completed = await Project.countDocuments({ status: 'Completed' });
    
    res.json({
      totalQuotations,
      requested,
      quoted,
      approved,
      rejected,
      ongoing,
      reported,
      completed
    });
  } catch (error) {
    console.error('Error fetching admin project stats:', error);
    res.status(500).json({ message: 'Server error while fetching admin stats' });
  }
});

// GET /api/admin/projects
// Get all projects with user info
router.get('/projects', async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('userId', 'firstName lastName email mobilePrefix mobile country')
      .sort({ createdAt: -1 });
      
    res.json(projects);
  } catch (error) {
    console.error('Error fetching all projects:', error);
    res.status(500).json({ message: 'Server error while fetching all projects' });
  }
});

// GET /api/admin/projects/:id
// Get a single project with user info
router.get('/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('userId', 'firstName lastName email mobilePrefix mobile country');
      
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

// PUT /api/admin/projects/:id
// Update project details (like estimated hours or status)
router.put('/projects/:id', upload.fields([{ name: 'quotationFile', maxCount: 1 }]), async (req, res) => {
  try {
    const { status, estimatedHours, freeHoursApplied, billableHours } = req.body;
    const Notification = require('../models/Notification');
    
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    let statusChanged = false;
    let oldStatus = project.status;
    if (status && status !== project.status) {
      project.status = status;
      project.statusHistory.push({ status });
      statusChanged = true;
    }
    if (estimatedHours !== undefined) project.estimatedHours = Number(estimatedHours);
    if (freeHoursApplied !== undefined) project.freeHoursApplied = Number(freeHoursApplied);
    if (billableHours !== undefined) project.billableHours = Number(billableHours);

    let quoteUploaded = false;
    if (req.files && req.files['quotationFile']) {
      const qFile = req.files['quotationFile'][0];
      project.quotationFiles.push({
        filename: qFile.filename,
        originalname: qFile.originalname,
        path: qFile.path,
        mimetype: qFile.mimetype,
        size: qFile.size
      });
      quoteUploaded = true;
    }
    
    const updatedProject = await project.save();

    // Deduct free hours from user if applied and this is the quote submission
    if (freeHoursApplied && Number(freeHoursApplied) > 0) {
      const user = await User.findById(project.userId);
      if (user) {
        user.freeHoursRemaining = Math.max(0, user.freeHoursRemaining - Number(freeHoursApplied));
        await user.save();
      }
    }

    // Create Notification
    if (quoteUploaded) {
      await Notification.create({
        userId: project.userId,
        projectId: project._id,
        title: 'Quote Ready',
        message: `A quotation has been provided for your project: ${project.title}.`,
        type: 'QUOTE_READY'
      });
    } else if (statusChanged) {
      await Notification.create({
        userId: project.userId,
        projectId: project._id,
        title: 'Project Update',
        message: `Your project '${project.title}' status changed to ${status}.`,
        type: 'PROJECT_UPDATE'
      });
    }

    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Server error while updating project' });
  }
});

// POST /api/admin/projects/:id/upload-completed
// Upload completed CAD files and Invoice files
router.post('/projects/:id/upload-completed', upload.fields([
  { name: 'completedFiles' },
  { name: 'invoiceFiles' }
]), async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    let filesUploaded = false;
    if (req.files) {
      if (req.files['completedFiles']) {
        const cFiles = req.files['completedFiles'].map(f => ({
          filename: f.filename,
          originalname: f.originalname,
          path: f.path,
          mimetype: f.mimetype,
          size: f.size
        }));
        project.completedFiles.push(...cFiles);
        filesUploaded = true;
      }
      
      if (req.files['invoiceFiles']) {
        const iFiles = req.files['invoiceFiles'].map(f => ({
          filename: f.filename,
          originalname: f.originalname,
          path: f.path,
          mimetype: f.mimetype,
          size: f.size
        }));
        project.invoiceFiles.push(...iFiles);
      }
    }

    const updatedProject = await project.save();

    if (filesUploaded) {
      await Notification.create({
        userId: project.userId,
        projectId: project._id,
        title: 'Files Delivered',
        message: `Completed CAD files are ready for your project: ${project.title}.`,
        type: 'FILES_DELIVERED'
      });
    }

    res.json(updatedProject);
  } catch (error) {
    console.error('Error uploading completed files:', error);
    res.status(500).json({ message: 'Server error while uploading files' });
  }
});

// --- Rates Management ---

// Get all rates
router.get('/rates', async (req, res) => {
  try {
    const rates = await Rate.find().sort({ createdAt: -1 });
    res.json(rates);
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching rates' });
  }
});

// Create new rate
router.post('/rates', async (req, res) => {
  try {
    const { country, hourlyRate, isActive } = req.body;
    
    if (isActive) {
      await Rate.updateMany({ country }, { isActive: false });
    }

    const rate = new Rate({ country, hourlyRate, isActive });
    await rate.save();
    res.status(201).json(rate);
  } catch (err) {
    res.status(500).json({ message: 'Server error creating rate' });
  }
});

// Update rate
router.put('/rates/:id', async (req, res) => {
  try {
    const { isActive, hourlyRate } = req.body;
    const rate = await Rate.findById(req.params.id);
    if (!rate) return res.status(404).json({ message: 'Rate not found' });

    if (isActive) {
      await Rate.updateMany({ country: rate.country }, { isActive: false });
    }

    if (isActive !== undefined) rate.isActive = isActive;
    if (hourlyRate !== undefined) rate.hourlyRate = hourlyRate;

    await rate.save();
    res.json(rate);
  } catch (err) {
    res.status(500).json({ message: 'Server error updating rate' });
  }
});

// Delete rate
router.delete('/rates/:id', async (req, res) => {
  try {
    await Rate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Rate deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error deleting rate' });
  }
});

module.exports = router;
