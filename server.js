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
const FROM_EMAIL = process.env.FROM_EMAIL || 'Plate AI <contact@theplateai.com>';

// Sends the welcome email. Fire-and-forget: a failure here never breaks signup.
function sendWelcomeEmail(email) {
  if (!resend) return; // not configured yet — skip silently
  resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Welcome to the Plate AI waitlist",
    replyTo: "contact@theplateai.com",
    text: "Hi,\n\nThanks for joining the Plate AI waitlist — you're confirmed. We'll email you as soon as we launch, and as an early supporter you've locked in a 30% launch discount.\n\nTalk soon,\nThe Plate AI team\ntheplateai.com",
    html: `
      <div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.6; font-size: 15px;">
        <p style="margin: 0 0 16px;">Hi,</p>
        <p style="margin: 0 0 16px;">Thanks for joining the <strong>Plate AI</strong> waitlist — you're confirmed. We'll email you as soon as we launch.</p>
        <p style="margin: 0 0 16px;">As an early supporter, you've locked in a <strong>30% launch discount</strong>.</p>
        <p style="margin: 0 0 4px;">Talk soon,</p>
        <p style="margin: 0; color: #555;">The Plate AI team</p>
        <p style="margin: 18px 0 0; font-size: 13px; color: #999;">theplateai.com</p>
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
