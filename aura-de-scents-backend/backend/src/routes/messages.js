const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

// 1. POST /api/messages - Public contact form submission
router.post('/', async (req, res) => {
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
        return res.status(201).json({ success: true, message: 'Message sent successfully!', data: rows[0] });
    } catch (err) {
        // This will print the EXACT database problem into your Render logs without crashing the server!
        console.error("DATABASE ERROR IN POST /api/messages:", err.message);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: err.message 
        });
    }
});

// 2. GET /api/messages - Admin only route to fetch all messages
router.get('/', requireAdmin, async (req, res) => {
    try {
        const query = 'SELECT * FROM contact_messages ORDER BY created_at DESC';
        const { rows } = await pool.query(query);
        return res.json(rows);
    } catch (err) {
        console.error("DATABASE ERROR IN GET /api/messages:", err.message);
        return res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// 3. DELETE /api/messages/:id - Admin only route to delete a message
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM contact_messages WHERE id = $1', [id]);
        return res.json({ success: true, message: 'Message deleted successfully.' });
    } catch (err) {
        console.error("DATABASE ERROR IN DELETE /api/messages:", err.message);
        return res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

module.exports = router;