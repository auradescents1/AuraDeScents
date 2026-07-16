/**
 * ============================================================
 * AURA DE SCENTS — Owner Dashboard Logic
 * Handles: Login, CRUD operations, Order management
 * Data layer: Backend REST API (JWT-authenticated)
 * ============================================================
 */

(function () {
  'use strict';

  const API_BASE = window.AURA_API_BASE || 'http://localhost:4000/api';
  const TOKEN_KEY = 'aura_admin_token';

  // ========== DOM REFERENCES ==========
  const loginOverlay = document.getElementById('loginOverlay');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const dashboardWrapper = document.getElementById('dashboardWrapper');
  const btnLogout = document.getElementById('btnLogout');
  const dashTabs = document.getElementById('dashTabs');
  const addProductForm = document.getElementById('addProductForm');
  const editModal = document.getElementById('editModal');
  const editModalClose = document.getElementById('editModalClose');
  const editProductForm = document.getElementById('editProductForm');

  let productsCache = [];
  let ordersCache = [];

  // ========== AUTH ==========

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  /** Wrapper around fetch() that attaches the admin JWT and handles 401s. */
  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      clearToken();
      showLogin();
      throw new Error('Session expired. Please log in again.');
    }

    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  /** Check if already authenticated */
  function checkAuth() {
    if (getToken()) {
      showDashboard();
    } else {
      showLogin();
    }
  }

  /** Login handler */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;

    const submitBtn = loginForm.querySelector('button[type="submit"], .btn-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials.');
      }

      setToken(data.token);
      loginError.style.display = 'none';
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message || 'Invalid credentials. Please try again.';
      loginError.style.display = 'block';
      loginForm.style.animation = 'none';
      requestAnimationFrame(() => {
        loginForm.style.animation = 'shake 0.4s ease';
      });
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  /** Show dashboard, hide login */
  function showDashboard() {
    loginOverlay.style.display = 'none';
    dashboardWrapper.style.display = 'block';
    refreshAll();
  }

  function showLogin() {
    loginOverlay.style.display = 'flex';
    dashboardWrapper.style.display = 'none';
  }

  /** Logout */
  btnLogout.addEventListener('click', () => {
    clearToken();
    showLogin();
    loginForm.reset();
  });

  // ========== STATS ==========

  function updateStats() {
    const pending = ordersCache.filter((o) => o.status === 'pending').length;
    const revenue = ordersCache.reduce((sum, o) => sum + (parseFloat(o.productPrice) || 0), 0);

    document.getElementById('statProducts').textContent = productsCache.length;
    document.getElementById('statOrders').textContent = ordersCache.length;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statRevenue').textContent = '$' + revenue.toLocaleString();
  }

  // ========== TABS ==========

  dashTabs.addEventListener('click', (e) => {
    if (!e.target.classList.contains('dash-tab')) return;

    dashTabs.querySelectorAll('.dash-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    e.target.classList.add('active');
    const tabId = 'tab-' + e.target.dataset.tab;
    document.getElementById(tabId).classList.add('active');
  });

  // ========== PRODUCT CRUD ==========

  /** Render product inventory list */
  function renderProducts() {
    const container = document.getElementById('dashProductList');

    if (productsCache.length === 0) {
      container.innerHTML =
        '<div class="no-data" style="grid-column:1/-1;"><p>No products yet. Add your first fragrance.</p></div>';
      return;
    }

    container.innerHTML = productsCache
      .map(
        (p) => `
      <div class="dash-product-item">
        <img class="dash-product-img" src="${p.image}" alt="${p.name}" loading="lazy"
             onerror="this.src='https://images.pexels.com/photos/29986521/pexels-photo-29986521.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=600&w=800'">
        <div class="dash-product-info">
          <h4>${p.name}</h4>
          <p class="dash-price">${Number(p.price).toLocaleString()}</p>
          <p class="dash-desc">${p.description}</p>
          <p class="dash-status ${p.status === 'in-stock' ? 'in-stock' : 'out-of-stock'}">
            ● ${p.status === 'in-stock' ? 'In Stock' : 'Out of Stock'}
          </p>
          <div class="dash-product-actions">
            <button class="btn-edit" data-id="${p.id}">Edit</button>
            <button class="btn-delete" data-id="${p.id}" data-name="${p.name}">Delete</button>
          </div>
        </div>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    container.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.id, btn.dataset.name));
    });
  }

  /** Uploads a File object and returns the hosted image URL. */
  async function uploadImageIfNeeded(fileInputEl, fallbackUrl) {
    const file = fileInputEl && fileInputEl.files && fileInputEl.files[0];
    if (!file) return fallbackUrl || '';

    const formData = new FormData();
    formData.append('image', file);

    const token = getToken();
    const res = await fetch(`${API_BASE}/products/upload-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Image upload failed.');

    // Backend returns a relative path like /uploads/xxx.jpg — resolve against API host.
    const apiOrigin = new URL(API_BASE).origin;
    return data.url.startsWith('http') ? data.url : `${apiOrigin}${data.url}`;
  }

  /** ADD product */
  addProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = addProductForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const imageInput = document.getElementById('newImage');
      const imageUrl = await uploadImageIfNeeded(imageInput);

      if (!imageUrl) {
        showToast('Please choose a product image.', 'error');
        return;
      }

      const payload = {
        name: document.getElementById('newName').value.trim(),
        price: parseFloat(document.getElementById('newPrice').value),
        description: document.getElementById('newDesc').value.trim(),
        image: imageUrl,
        status: document.getElementById('newStatus').value,
        topNotes: document.getElementById('newTopNotes').value.trim(),
        heartNotes: document.getElementById('newHeartNotes').value.trim(),
        baseNotes: document.getElementById('newBaseNotes').value.trim(),
      };

      if (!payload.name || !payload.price || !payload.description) {
        showToast('Please fill in all fields.', 'error');
        return;
      }

      const created = await apiFetch('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      addProductForm.reset();
      await refreshAll();
      showToast(`"${created.name}" has been added to the collection.`, 'success');
      switchToTab('products');
    } catch (err) {
      showToast(err.message || 'Could not add product.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  /** DELETE product */
  async function deleteProduct(id, name) {
    if (!confirm(`Are you sure you want to remove "${name}" from the collection? This action cannot be undone.`)) {
      return;
    }
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' });
      await refreshAll();
      showToast(`"${name}" has been removed from the collection.`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not delete product.', 'error');
    }
  }

  /** EDIT — Open modal */
  function openEditModal(id) {
    const product = productsCache.find((p) => p.id === id);
    if (!product) return;

    document.getElementById('editId').value = product.id;
    document.getElementById('editName').value = product.name;
    document.getElementById('editPrice').value = product.price;
    document.getElementById('editDesc').value = product.description;
    document.getElementById('editImage').value = product.image;
    document.getElementById('editStatus').value = product.status;
    document.getElementById('editTopNotes').value = product.topNotes || '';
    document.getElementById('editHeartNotes').value = product.heartNotes || '';
    document.getElementById('editBaseNotes').value = product.baseNotes || '';

    editModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  /** Close edit modal */
  function closeEditModal() {
    editModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  editModalClose.addEventListener('click', closeEditModal);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditModal();
  });

  /** EDIT — Save changes */
  editProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const submitBtn = editProductForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const payload = {
        name: document.getElementById('editName').value.trim(),
        price: parseFloat(document.getElementById('editPrice').value),
        description: document.getElementById('editDesc').value.trim(),
        image: document.getElementById('editImage').value.trim(),
        status: document.getElementById('editStatus').value,
        topNotes: document.getElementById('editTopNotes').value.trim(),
        heartNotes: document.getElementById('editHeartNotes').value.trim(),
        baseNotes: document.getElementById('editBaseNotes').value.trim(),
      };

      const updated = await apiFetch(`/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeEditModal();
      await refreshAll();
      showToast(`"${updated.name}" has been updated.`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not update product.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // ========== ORDERS ==========

  /** Render orders table */
  function renderOrders() {
    const tbody = document.getElementById('ordersTableBody');

    if (ordersCache.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="no-data">No orders yet. Orders placed on the store will appear here.</td>
        </tr>`;
      return;
    }

    // Orders already come back newest-first from the API.
    tbody.innerHTML = ordersCache
      .map((order) => {
        const productDisplay = (order.items || [])
          .map(
            (item) =>
              `<div style="margin-bottom:4px;">${item.name} <span style="color:var(--white-faint);">×${item.quantity}</span></div>`
          )
          .join('');

        return `
            <tr>
              <td style="font-size:0.75rem; color:var(--white-faint);">${order.id.substring(0, 16)}...</td>
              <td style="color:var(--cream); font-weight:500;">${order.customerName}</td>
              <td>${order.email}</td>
              <td>${order.phone1}</td>
              <td>${order.phone2 || '—'}</td>
              <td style="max-width:180px; white-space:normal; line-height:1.4;">${order.address}</td>
              <td style="color:var(--gold); font-weight:500; max-width:200px;">${productDisplay}</td>
              <td style="font-weight:600;">$${parseFloat(order.productPrice).toLocaleString()}</td>
              <td style="font-size:0.82rem; white-space:nowrap;">${formatDate(order.createdAt)}</td>
              <td>
                <button class="status-badge ${order.status}" data-order-id="${order.id}" title="Click to cycle status">
                  ${capitalize(order.status)}
                </button>
              </td>
            </tr>
          `;
      })
      .join('');

    tbody.querySelectorAll('.status-badge').forEach((badge) => {
      badge.addEventListener('click', () => toggleOrderStatus(badge.dataset.orderId));
    });
  }

  /** Cycle order status: pending → shipped → delivered → pending */
  async function toggleOrderStatus(orderId) {
    try {
      const updated = await apiFetch(`/orders/${orderId}/status`, { method: 'PATCH' });
      await refreshAll();
      showToast(`Order status updated to "${capitalize(updated.status)}".`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not update order status.', 'error');
    }
  }

  // ========== HELPERS ==========

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatDate(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function switchToTab(tabName) {
    dashTabs.querySelectorAll('.dash-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    const tab = dashTabs.querySelector(`[data-tab="${tabName}"]`);
    if (tab) tab.classList.add('active');
    const content = document.getElementById('tab-' + tabName);
    if (content) content.classList.add('active');
  }

  async function refreshAll() {
    try {
      const [products, orders] = await Promise.all([apiFetch('/products'), apiFetch('/orders')]);
      productsCache = products;
      ordersCache = orders;
      updateStats();
      renderProducts();
      renderOrders();
    } catch (err) {
      showToast(err.message || 'Could not load dashboard data.', 'error');
    }
  }

  // ========== TOAST NOTIFICATIONS ==========

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // ========== SHAKE ANIMATION (inline) ==========
  const shakeStyle = document.createElement('style');
  shakeStyle.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      50% { transform: translateX(10px); }
      75% { transform: translateX(-5px); }
    }
  `;
  document.head.appendChild(shakeStyle);

  // ========== INIT ==========

  function init() {
    checkAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
