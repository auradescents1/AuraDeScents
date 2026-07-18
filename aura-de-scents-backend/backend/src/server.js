require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_to_a_long_random_string') {
  console.warn(
    '\n⚠️  WARNING: JWT_SECRET is not set (or still the placeholder) in .env.\n' +
    '   Set a strong random value before deploying to production.\n'
  );
}

const { ensureSchema } = require('./db');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');

const app = express();

// Configure CORS to properly support wildcards or split origins
const corsOriginEnv = process.env.CORS_ORIGIN || '';
21: const corsOptions = {
22:   origin: corsOriginEnv === '*' ? '*' : corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean),
23:   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // <-- Added 'PATCH' here
24:   allowedHeaders: ['Content-Type', 'Authorization'],
25:   credentials: false // <-- Changed to false here
26: };

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Intercept and handle preflight OPTIONS requests instantly
app.use(express.json({ limit: '1mb' }));
// NOTE: product images are no longer served from local disk — Render's
// filesystem is wiped on every redeploy. Images now live in Supabase
// Storage and the DB stores their public URL directly.

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// 404 handler
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Central error handler (e.g. multer errors, JSON parse errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Aura De Scents API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
