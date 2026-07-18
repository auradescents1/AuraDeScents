const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Adjust path to your db config if needed
const { requireAdmin } = require('../middleware/auth'); // Adjust path to your auth middleware

// 1. POST /api/messages - Public route to submit a contact form message
router.post('/', async (req, res, next) => {
    try {
        const { name, email, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const query = `
            INSERT INTO contact_messages (name, email, message)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        
        const { rows } = await pool.query(query, [name, email, message]);
        res.status(201).json({ message: 'Message sent successfully!', data: rows[0] });
    } catch (err) {
        console.error("Database Error on POST /api/messages:", err.message);
        res.status(500).json({ 
            error: 'Failed to save message to database.', 
            details: err.message 
        });
    }
});

// 2. GET /api/messages - Admin only route to fetch all messages
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 3. DELETE /api/messages/:id - Admin only route to delete a message
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM contact_messages WHERE id = $1', [id]);
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }
    res.json({ message: 'Message deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;