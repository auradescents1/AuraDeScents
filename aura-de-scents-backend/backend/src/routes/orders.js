const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders placed in a short time. Please wait a moment and try again.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rowToOrder(order, items) {
  return {
    id: order.id,
    customerName: order.customer_name,
    email: order.email,
    phone1: order.phone1,
    phone2: order.phone2 || '',
    address: order.address,
    productPrice: Number(order.total_price),
    status: order.status,
    createdAt: order.created_at,
    items: items.map((it) => ({
      id: it.product_id,
      name: it.product_name,
      price: Number(it.price),
      quantity: it.quantity,
    })),
  };
}

// POST /api/orders — place an order (public). Cart items are re-priced
// server-side from the products table so a client can't tamper with totals.
router.post('/', orderLimiter, async (req, res, next) => {
  const { items, customerName, email, phone1, phone2, address } = req.body || {};

  const errors = [];
  if (!Array.isArray(items) || items.length === 0) errors.push('Cart is empty.');
  if (!customerName || !customerName.trim()) errors.push('Full name is required.');
  if (!email || !EMAIL_RE.test(email.trim())) errors.push('A valid email is required.');
  if (!phone1 || !phone1.trim()) errors.push('Primary phone is required.');
  if (!address || !address.trim()) errors.push('Delivery address is required.');
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  // Checked out from the pool so all statements below share one transaction.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resolvedItems = [];
    for (const item of items) {
      const { rows } = await client.query('SELECT * FROM products WHERE id = $1', [item.id]);
      const product = rows[0];
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product ${item.id} does not exist.` });
      }
      if (product.status === 'out-of-stock') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `"${product.name}" is currently out of stock.` });
      }
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        price: Number(product.price),
        quantity,
      });
    }

    const totalPrice = resolvedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const orderId = 'ord_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');

    await client.query(
      `INSERT INTO orders (id, customer_name, email, phone1, phone2, address, total_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [orderId, customerName.trim(), email.trim(), phone1.trim(), (phone2 || '').trim(), address.trim(), totalPrice]
    );

    for (const it of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, it.productId, it.productName, it.price, it.quantity]
      );
    }

    await client.query('COMMIT');

    const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const { rows: itemRows } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    res.status(201).json(rowToOrder(orderRows[0], itemRows));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/orders — list all orders (admin only)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { rows: orders } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const results = [];
    for (const o of orders) {
      const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [o.id]);
      results.push(rowToOrder(o, items));
    }
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/status — cycle or set order status (admin only)
router.patch('/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const CYCLE = { pending: 'shipped', shipped: 'delivered', delivered: 'pending' };
    const nextStatus = req.body && req.body.status ? req.body.status : CYCLE[order.status];

    if (!['pending', 'shipped', 'delivered'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [nextStatus, req.params.id]);
    const { rows: updatedRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    res.json(rowToOrder(updatedRows[0], items));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orders/:id - Delete any order unconditionally (admin only)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    // 1. Check if the order exists
    const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
    const order = rows[0];

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // 2. Delete related items first due to foreign key constraints, then the order
    await pool.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);

    res.json({ message: 'Order successfully purged from the database.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
