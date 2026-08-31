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
  { name: 'scanFiles', maxCount: 5 },
  { name: 'referenceImages', maxCount: 5 }
]), async (req, res) => {
  try {
    const {
      title, description, appType, industry, cadOutput, 
      accuracy, partSize, turnaround, nda, useFreeHours
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
      scanFiles,
      referenceImages,
      statusHistory: [{ status: 'Pending Quote' }]
    });

    const savedProject = await newProject.save();

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
    
    res.json({ message: 'Status updated successfully', project: updatedProject });
  } catch (error) {
    console.error('Error updating project status:', error);
    res.status(500).json({ message: 'Server error while updating status' });
  }
});

module.exports = router;
