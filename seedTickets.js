const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Ticket = require('./models/Ticket');

async function seedTickets() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/my_database');

    // Find all non-admin users or default user
    const users = await User.find({ role: { $ne: 'admin' } });

    if (!users || users.length === 0) {
      console.log('No customer users found in database to attach tickets to.');
      process.exit(0);
    }

    for (const user of users) {
      console.log(`Checking tickets for user: ${user.email} (${user._id})`);
      
      // Delete existing tickets for this user to ensure fresh seed
      await Ticket.deleteMany({ userId: user._id });

      const now = Date.now();
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
      const fifteenMinsAgo = new Date(now - 15 * 60 * 1000);
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
      const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);

      const ticketsToSeed = [
        {
          ticketId: '#TKT-2024-001',
          userId: user._id,
          subject: 'Mesh distortion on turbine blade scan',
          subtext: 'High-priority precision error',
          category: 'Data Processing',
          description: 'We detected significant triangulated mesh distortion around the leading edge of the turbine blade scan (STP conversion). Accuracy needs to remain within 0.02mm for CFD aerodynamic analysis.',
          priority: 'High',
          status: 'IN PROGRESS',
          lastActivity: twoHoursAgo,
          createdAt: new Date('2023-10-12T09:30:00Z'),
          messages: [
            {
              senderId: user._id,
              senderName: `${user.firstName} ${user.lastName}`,
              senderRole: 'customer',
              message: 'We detected significant triangulated mesh distortion around the leading edge of the turbine blade scan (STP conversion). Accuracy needs to remain within 0.02mm for CFD aerodynamic analysis.',
              createdAt: new Date('2023-10-12T09:30:00Z')
            },
            {
              senderName: 'ConvertScanToCAD Engineering',
              senderRole: 'agent',
              message: 'Our metrology team is actively performing localized adaptive NURBS reconstruction on the leading edge. We are cross-referencing against the laser point cloud deviation report.',
              createdAt: twoHoursAgo
            }
          ]
        },
        {
          ticketId: '#TKT-2024-015',
          userId: user._id,
          subject: 'API key integration failure',
          subtext: 'Connection timeout during handshake',
          category: 'Technical',
          description: 'Our automated webhook system is failing to authenticate with the ConvertScanToCAD API endpoint. Returning 408 Connection Timeout during the handshake process.',
          priority: 'Medium',
          status: 'AWAITING CLIENT',
          lastActivity: fifteenMinsAgo,
          createdAt: new Date('2023-10-14T11:15:00Z'),
          messages: [
            {
              senderId: user._id,
              senderName: `${user.firstName} ${user.lastName}`,
              senderRole: 'customer',
              message: 'Our automated webhook system is failing to authenticate with the ConvertScanToCAD API endpoint. Returning 408 Connection Timeout during the handshake process.',
              createdAt: new Date('2023-10-14T11:15:00Z')
            },
            {
              senderName: 'ConvertScanToCAD Support',
              senderRole: 'agent',
              message: 'We reviewed your incoming handshake logs. Your perimeter firewall appears to be blocking the TLS certificate callback. Could you whitelist our gateway IP (52.28.112.44) and verify if the connection succeeds?',
              createdAt: fifteenMinsAgo
            }
          ]
        },
        {
          ticketId: '#TKT-2023-089',
          userId: user._id,
          subject: 'Missing point cloud metadata',
          subtext: 'Exporting from Leica BLK360 scanner E57 format',
          category: 'Calibration',
          description: 'Exporting point cloud coordinates from the Leica BLK360 E57 scan seems unaligned with the global datum planes. Normal vectors appear inverted in quadrant 3.',
          priority: 'Medium',
          status: 'RESOLVED',
          lastActivity: threeDaysAgo,
          createdAt: new Date('2023-09-28T14:20:00Z'),
          messages: [
            {
              senderId: user._id,
              senderName: `${user.firstName} ${user.lastName}`,
              senderRole: 'customer',
              message: 'Exporting point cloud coordinates from the Leica BLK360 E57 scan seems unaligned with the global datum planes. Normal vectors appear inverted in quadrant 3.',
              createdAt: new Date('2023-09-28T14:20:00Z')
            },
            {
              senderName: 'Metrology Lab',
              senderRole: 'agent',
              message: 'We re-indexed the coordinate transformation matrix and corrected the flipped face normals. The revised STEP and SLDPRT files have been regenerated and verified.',
              createdAt: new Date(threeDaysAgo.getTime() - 4 * 60 * 60 * 1000)
            },
            {
              senderId: user._id,
              senderName: `${user.firstName} ${user.lastName}`,
              senderRole: 'customer',
              message: 'Received the revised files. The datum alignment matches our CMM fixture perfectly. Marking as resolved!',
              createdAt: threeDaysAgo
            }
          ]
        },
        {
          ticketId: '#TKT-2024-022',
          userId: user._id,
          subject: 'STEP vs IGES solid geometry tolerance inquiry',
          subtext: 'Class-A surfacing requirement for injection molding',
          category: 'Data Processing',
          description: 'We need confirmation if STEP AP242 format retains curvature continuity (G2) for automotive exterior components better than IGES.',
          priority: 'Urgent',
          status: 'OPEN',
          lastActivity: fiveHoursAgo,
          createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
          messages: [
            {
              senderId: user._id,
              senderName: `${user.firstName} ${user.lastName}`,
              senderRole: 'customer',
              message: 'We need confirmation if STEP AP242 format retains curvature continuity (G2) for automotive exterior components better than IGES.',
              createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000)
            }
          ]
        },
        {
          ticketId: '#TKT-2024-028',
          userId: user._id,
          subject: 'Complimentary CAD hours credit verification',
          subtext: 'Applied to project quotation discount',
          category: 'Billing',
          description: 'Please confirm that the 3 complimentary welcome CAD hours have been credited against the billable hours for our recent engine bracket project.',
          priority: 'Low',
          status: 'RESOLVED',
          lastActivity: fiveDaysAgo,
          createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
          messages: [
            {
              senderId: user._id,
              senderName: `${user.firstName} ${user.lastName}`,
              senderRole: 'customer',
              message: 'Please confirm that the 3 complimentary welcome CAD hours have been credited against the billable hours for our recent engine bracket project.',
              createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000)
            },
            {
              senderName: 'Billing Team',
              senderRole: 'agent',
              message: 'Confirmed! The 3 free welcome hours were successfully deducted, reducing billable hours from 7 to 4. Your updated invoice is available in Billing.',
              createdAt: fiveDaysAgo
            }
          ]
        }
      ];

      await Ticket.insertMany(ticketsToSeed);
      console.log(`Seeded ${ticketsToSeed.length} realistic tickets for ${user.email}`);
    }

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding tickets:', error);
    process.exit(1);
  }
}

seedTickets();
