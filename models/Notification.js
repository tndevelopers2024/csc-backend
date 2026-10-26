const mongoose = require('mongoose');
const sendNotificationEmail = require('../utils/mailer');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['PROJECT_UPDATE', 'QUOTE_READY', 'FILES_DELIVERED', 'SYSTEM']
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

notificationSchema.post('save', async function(doc, next) {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(doc.userId);
    if (user && user.email) {
      const htmlContent = `
        <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #f3f4f6;">
          <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); text-align: center;">
            <h1 style="color: #2563eb; font-size: 28px; margin-top: 0; margin-bottom: 10px;">ConversCantoCAD</h1>
            <h2 style="color: #1f2937; font-size: 20px; font-weight: 500; margin-top: 0; margin-bottom: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 15px;">Notification Update</h2>
            
            <div style="text-align: left; background-color: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin-bottom: 30px;">
              <h3 style="color: #1e293b; font-size: 18px; margin-top: 0; margin-bottom: 10px;">${doc.title}</h3>
              <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0;">
                ${doc.message}
              </p>
            </div>
            
            <a href="https://converscantocad.com/" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px; transition: background-color 0.2s;">Go to Dashboard</a>
          </div>
          
          <div style="text-align: center; margin-top: 25px; color: #6b7280; font-size: 14px;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} ConversCantoCAD. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This is an automated notification, please do not reply.</p>
          </div>
        </div>
      `;

      await sendNotificationEmail(
        user.email,
        `New Notification: ${doc.title}`,
        `${doc.message}\n\nPlease log in to your account to view more details.`,
        htmlContent
      );
    }
  } catch (error) {
    console.error('Error in Notification post save hook sending email:', error);
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
