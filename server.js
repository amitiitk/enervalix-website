const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database('./demo.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

// Create demo_bookings table if it doesn't exist
function initDatabase() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS demo_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      organization TEXT,
      org_type TEXT,
      preferred_date TEXT,
      preferred_time_slot TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Database table ready');
    }
  });
}

// Email transporter setup (optional)
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  console.log('Email transporter configured');
} else {
  console.log('SMTP not configured - emails will be skipped');
}

// API: POST /api/demo-bookings
app.post('/api/demo-bookings', (req, res) => {
  const { name, email, phone, organization, org_type, preferred_date, preferred_time_slot, message } = req.body;

  // Validation
  if (!name || !email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Name and email are required' 
    });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid email format' 
    });
  }

  // Insert into database
  const insertSQL = `
    INSERT INTO demo_bookings 
    (name, email, phone, organization, org_type, preferred_date, preferred_time_slot, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    insertSQL,
    [name, email, phone, organization, org_type, preferred_date, preferred_time_slot, message],
    function(err) {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to save booking request' 
        });
      }

      const bookingId = this.lastID;
      console.log(`New demo booking created: ID ${bookingId}, Email: ${email}`);

      // Send emails if SMTP is configured
      if (transporter) {
        sendConfirmationEmail(email, name);
        sendAdminNotification(bookingId, { name, email, phone, organization, org_type, preferred_date, preferred_time_slot, message });
      }

      res.json({ 
        success: true, 
        bookingId: bookingId,
        message: 'Demo booking request submitted successfully!' 
      });
    }
  );
});

// API: GET /api/demo-bookings (Admin only)
app.get('/api/demo-bookings', (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized: Invalid API key' 
    });
  }

  const selectSQL = 'SELECT * FROM demo_bookings ORDER BY created_at DESC';

  db.all(selectSQL, [], (err, rows) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to retrieve bookings' 
      });
    }

    res.json({ 
      success: true, 
      count: rows.length,
      bookings: rows 
    });
  });
});

// Send confirmation email to user
async function sendConfirmationEmail(email, name) {
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: 'Demo Booking Confirmation - Enervalix',
      html: `
        <h2>Thank you for your interest in Enervalix!</h2>
        <p>Dear ${name},</p>
        <p>We've received your demo booking request and our team will contact you shortly to schedule your personalized demonstration.</p>
        <p>In the meantime, feel free to explore our <a href="http://localhost:${PORT}/features.html">features page</a> to learn more about how Enervalix can help optimize your energy consumption and reduce carbon emissions.</p>
        <p>Best regards,<br>The Enervalix Team</p>
      `
    });
    console.log(`Confirmation email sent to ${email}`);
  } catch (error) {
    console.error('Error sending confirmation email:', error.message);
  }
}

// Send notification email to admin
async function sendAdminNotification(bookingId, data) {
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: `New Demo Booking Request #${bookingId}`,
      html: `
        <h2>New Demo Booking Request</h2>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Name:</strong> ${data.name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Phone:</strong> ${data.phone || 'N/A'}</p>
        <p><strong>Organization:</strong> ${data.organization || 'N/A'}</p>
        <p><strong>Organization Type:</strong> ${data.org_type || 'N/A'}</p>
        <p><strong>Preferred Date:</strong> ${data.preferred_date || 'N/A'}</p>
        <p><strong>Preferred Time:</strong> ${data.preferred_time_slot || 'N/A'}</p>
        <p><strong>Message:</strong> ${data.message || 'N/A'}</p>
      `
    });
    console.log(`Admin notification sent for booking #${bookingId}`);
  } catch (error) {
    console.error('Error sending admin notification:', error.message);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`✓ Enervalix server running on http://localhost:${PORT}`);
  console.log(`✓ Access the website at http://localhost:${PORT}/index.html`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});