const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { uploadImage } = require('../lib/supabaseStorage');

const router = express.Router();

// Files are held in memory only, then streamed straight to Supabase Storage.
// (No local disk writes — Render's filesystem doesn't persist across deploys.)
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WEBP, or AVIF images are allowed.'));
    }
    cb(null, true);
  },
});

function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    description: row.description,
    image: row.image,
    status: row.status,
    topNotes: row.top_notes,
    heartNotes: row.heart_notes,
    baseNotes: row.base_notes,
    createdAt: row.created_at,
  };
}

// ---------- PUBLIC ----------

// GET /api/products — list all products
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at ASC');
    res.json(rows.map(rowToProduct));
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — single product
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found.' });
    res.json(rowToProduct(rows[0]));
  } catch (err) {
    next(err);
  }
});

// POST /api/products/upload-image — upload a product image (admin only), returns a URL
router.post('/upload-image', requireAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

    try {
      const ext = (req.file.originalname.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      const filename = `${crypto.randomUUID()}${ext}`;
      const url = await uploadImage(req.file.buffer, filename, req.file.mimetype);
      res.json({ url });
    } catch (uploadErr) {
      console.error(uploadErr);
      res.status(500).json({ error: 'Image upload failed.' });
    }
  });
});

// ---------- ADMIN ----------

function validateProductBody(body, { partial = false } = {}) {
  const errors = [];
  const required = ['name', 'price', 'description', 'image'];

  if (!partial) {
    for (const field of required) {
      if (body[field] === undefined || body[field] === '') errors.push(`"${field}" is required.`);
    }
  }

  if (body.price !== undefined && (isNaN(Number(body.price)) || Number(body.price) <= 0)) {
    errors.push('"price" must be a positive number.');
  }

  if (body.status !== undefined && !['in-stock', 'out-of-stock'].includes(body.status)) {
    errors.push('"status" must be "in-stock" or "out-of-stock".');
  }

  return errors;
}

// POST /api/products — create product (admin only)
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const errors = validateProductBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const id = 'prod_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const {
      name,
      price,
      description,
      image,
      status = 'in-stock',
      topNotes = '',
      heartNotes = '',
      baseNotes = '',
    } = req.body;

    await pool.query(
      `INSERT INTO products (id, name, price, description, image, status, top_notes, heart_notes, base_notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        name.trim(),
        Number(price),
        description.trim(),
        image,
        status,
        topNotes.trim(),
        heartNotes.trim(),
        baseNotes.trim(),
        Date.now(),
      ]
    );

    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    res.status(201).json(rowToProduct(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id — update product (admin only)
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows: existingRows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    const errors = validateProductBody(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const merged = {
      name: (req.body.name ?? existing.name).trim(),
      price: req.body.price !== undefined ? Number(req.body.price) : Number(existing.price),
      description: (req.body.description ?? existing.description).trim(),
      image: (req.body.image ?? existing.image),
      status: req.body.status ?? existing.status,
      topNotes: (req.body.topNotes ?? existing.top_notes ?? '').trim(),
      heartNotes: (req.body.heartNotes ?? existing.heart_notes ?? '').trim(),
      baseNotes: (req.body.baseNotes ?? existing.base_notes ?? '').trim(),
    };

    await pool.query(
      `UPDATE products
       SET name = $1, price = $2, description = $3, image = $4, status = $5, top_notes = $6, heart_notes = $7, base_notes = $8
       WHERE id = $9`,
      [
        merged.name,
        merged.price,
        merged.description,
        merged.image,
        merged.status,
        merged.topNotes,
        merged.heartNotes,
        merged.baseNotes,
        req.params.id,
      ]
    );

    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(rowToProduct(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — remove product (admin only)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found.' });

    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
