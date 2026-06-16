require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ──────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Email (Resend) ────────────────────────────────────
const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Plate AI <hello@theplateai.com>';

// Sends the welcome email. Fire-and-forget: a failure here never breaks signup.
function sendWelcomeEmail(email) {
  if (!resend) return; // not configured yet — skip silently
  resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "You're on the list! 🍽️",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 36px 28px; color: #1A1A1A; line-height: 1.6;">
        <h1 style="font-size: 26px; margin: 0 0 16px; letter-spacing: -0.5px;">You're on the list! 🍽️</h1>
        <p style="font-size: 15px; color: #444; margin: 0 0 16px;">
          Thanks for joining the <strong>Plate&nbsp;AI</strong> waitlist. We'll email you the moment we launch —
          you'll be among the very first to turn any fridge into a 5-star meal.
        </p>
        <p style="font-size: 15px; color: #444; margin: 0 0 24px;">
          As an early supporter, you've locked in <strong style="color:#E07A5F;">30% off Pro</strong> at launch. 🎉
        </p>
        <p style="font-size: 14px; color: #888; margin: 0;">— The Plate AI team</p>
      </div>
    `
  })
    .then(() => console.log('📧 Welcome email sent to', email))
    .catch(e => console.error('Email send failed:', e.message || e));
}

// Create table if it doesn't exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✅ Database ready');
}

// ── Middleware ────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────

// POST /api/waitlist — add email
app.post('/api/waitlist', async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  try {
    const cleanEmail = email.toLowerCase().trim();
    await pool.query('INSERT INTO waitlist (email) VALUES ($1)', [cleanEmail]);
    sendWelcomeEmail(cleanEmail);
    return res.status(201).json({ message: 'Successfully joined the waitlist!' });
  } catch (err) {
    if (err.code === '23505') {
      // unique violation — already signed up
      return res.status(409).json({ message: "You're already on the list!" });
    }
    console.error('DB error:', err.message);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/waitlist/count — total signups
app.get('/api/waitlist/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS count FROM waitlist');
    return res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('DB error:', err.message);
    return res.status(500).json({ count: 0 });
  }
});

// Catch-all → serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🍽️  Plate AI server running → http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });
