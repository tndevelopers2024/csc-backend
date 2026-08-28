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
      referenceImages
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

module.exports = router;
