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
    await pool.query(
      'INSERT INTO waitlist (email) VALUES ($1)',
      [email.toLowerCase().trim()]
    );
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
