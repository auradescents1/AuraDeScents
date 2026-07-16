require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, ensureSchema } = require('./index');

const DEFAULT_PRODUCTS = [
  {
    id: 'prod_001',
    name: 'Avantus Creed',
    price: 385,
    description:
      'A bold, invigorating fusion of Italian bergamot, French apple, and Haitian vetiver. Inspired by the spirit of triumph, Avantus Creed radiates confidence and sophistication.',
    image:
      'https://images.pexels.com/photos/11711808/pexels-photo-11711808.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
    status: 'in-stock',
    topNotes: 'Bergamot, Blackcurrant, Apple, Pineapple',
    heartNotes: 'Birch, Patchouli, Moroccan Jasmine',
    baseNotes: 'Musk, Oakmoss, Ambergris, Vetiver',
  },
  {
    id: 'prod_002',
    name: 'White Oud',
    price: 520,
    description:
      'A luminous interpretation of traditional oud — softened with Bulgarian rose, white musk, and a whisper of saffron. Ethereal yet commanding, for those who seek the extraordinary.',
    image:
      'https://images.pexels.com/photos/7850600/pexels-photo-7850600.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
    status: 'in-stock',
    topNotes: 'Saffron, Pink Pepper, Bergamot',
    heartNotes: 'Bulgarian Rose, White Oud, Cedarwood',
    baseNotes: 'White Musk, Amber, Sandalwood',
  },
  {
    id: 'prod_003',
    name: 'Bukraat',
    price: 450,
    description:
      'An ancient elixir reimagined — smoky frankincense, aged amber, and rare Cambodian oud intertwine with delicate jasmine. A scent for the philosopher and the conqueror.',
    image:
      'https://images.pexels.com/photos/36834015/pexels-photo-36834015.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
    status: 'in-stock',
    topNotes: 'Frankincense, Cardamom, Bergamot',
    heartNotes: 'Cambodian Oud, Jasmine, Rose',
    baseNotes: 'Aged Amber, Sandalwood, Leather',
  },
];

async function seedProducts() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  if (rows[0].n > 0) {
    console.log(`Products already seeded (${rows[0].n} rows) — skipping.`);
    return;
  }

  const insertSql = `
    INSERT INTO products (id, name, price, description, image, status, top_notes, heart_notes, base_notes, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;

  for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
    const p = DEFAULT_PRODUCTS[i];
    await pool.query(insertSql, [
      p.id,
      p.name,
      p.price,
      p.description,
      p.image,
      p.status,
      p.topNotes,
      p.heartNotes,
      p.baseNotes,
      Date.now() + i,
    ]);
  }
  console.log(`Seeded ${DEFAULT_PRODUCTS.length} default products.`);
}

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  const { rows } = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
  if (rows.length) {
    console.log(`Admin "${username}" already exists — skipping.`);
    return;
  }

  if (!password) {
    console.warn(
      'WARNING: ADMIN_PASSWORD not set in .env — skipping admin creation. Set it and re-run "npm run seed".'
    );
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash]);
  console.log(`Created admin account "${username}". Remember to keep the password safe.`);
}

async function main() {
  await ensureSchema();
  await seedProducts();
  await seedAdmin();
  await pool.end();
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
