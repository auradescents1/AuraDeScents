/**
 * ============================================================
 * AURA DE SCENTS — Public Site Script
 * Shared across index.html, about.html, collection.html, contact.html
 * Handles: Navbar, Cart, Checkout, Product Grid, Product Detail Modal
 * Data layer: LocalStorage (shared with dashboard.js)
 * ============================================================
 */

(function () {
  'use strict';

  // ========== CONSTANTS ==========
  const STORAGE_KEYS = {
    CART: 'aura_cart', // cart stays in the browser — it's per-visitor, not shared data
  };

  const API_BASE = window.AURA_API_BASE || 'http://localhost:4000/api';

  const FALLBACK_IMAGE =
    'https://images.pexels.com/photos/29986521/pexels-photo-29986521.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800';

  // ========== STATE ==========
  let cart = [];
  let productsCache = [];

  // ========== DATA LAYER (backend-backed) ==========

  async function fetchProducts() {
    try {
      const res = await fetch(`${API_BASE}/products`);
      if (!res.ok) throw new Error('Failed to load products');
      productsCache = await res.json();
      return productsCache;
    } catch (err) {
      console.error('Could not reach the store API:', err);
      showToast('Could not connect to the store. Please try again shortly.', 'error');
      return [];
    }
  }

  // Synchronous accessor used by render/cart code — relies on productsCache
  // being populated by fetchProducts() during init.
  function getProducts() {
    return productsCache;
  }

  async function submitOrder(order) {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not place order.');
    return data;
  }

  function loadCart() {
    const data = localStorage.getItem(STORAGE_KEYS.CART);
    cart = data ? JSON.parse(data) : [];
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  }

  function clearCart() {
    cart = [];
    saveCart();
  }

  // ========== CART FUNCTIONALITY ==========

  function addToCart(productId) {
    const products = getProducts();
    const product = products.find((p) => p.id === productId);
    if (!product || product.status === 'out-of-stock') return;

    const existingItem = cart.find((item) => item.id === productId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        // Safe array check: use the first item if it's an array, otherwise use the string directly
        image: Array.isArray(product.image) ? product.image[0] : product.image,
        quantity: 1,
      });
    }

    saveCart();
    updateCartUI();

    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
      cartCount.classList.add('pop');
      setTimeout(() => cartCount.classList.remove('pop'), 400);
    }

    showToast(`${product.name} added to cart`, 'success');
  }

  function removeFromCart(productId) {
    const item = cart.find((i) => i.id === productId);
    cart = cart.filter((item) => item.id !== productId);
    saveCart();
    updateCartUI();
    renderCartItems();
    if (item) showToast(`${item.name} removed from cart`, 'success');
  }

  function updateQuantity(productId, delta) {
    const item = cart.find((i) => i.id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    saveCart();
    updateCartUI();
    renderCartItems();
  }

  function getCartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function getCartItemCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function updateCartUI() {
    const count = getCartItemCount();
    const cartCountEl = document.getElementById('cartCount');
    const cartItemCountEl = document.getElementById('cartItemCount');
    const cartSubtotalEl = document.getElementById('cartSubtotal');
    const btnCheckout = document.getElementById('btnCheckout');

    if (cartCountEl) {
      cartCountEl.textContent = count;
      cartCountEl.classList.toggle('visible', count > 0);
    }
    if (cartItemCountEl) {
      cartItemCountEl.textContent = `(${count} item${count !== 1 ? 's' : ''})`;
    }
    if (cartSubtotalEl) {
      cartSubtotalEl.textContent = `${getCartTotal().toLocaleString()}`;
    }
    if (btnCheckout) {
      btnCheckout.disabled = count === 0;
    }
  }

  function renderCartItems() {
    const container = document.getElementById('cartItems');
    if (!container) return;

    if (cart.length === 0) {
      container.innerHTML = `
        <div class="cart-empty">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6h15l-1.5 9h-12z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="9" cy="20" r="1.5" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="17" cy="20" r="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M6 6L5 3H2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>Your cart is empty</p>
          <span>Discover our exquisite collection</span>
        </div>`;
      return;
    }

    container.innerHTML = cart
      .map(
        (item) => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-img">
          <img src="${item.image || FALLBACK_IMAGE}" 
     alt="${item.name}" 
     loading="lazy" 
     onerror="this.src='${FALLBACK_IMAGE}'">
        </div>
        <div class="cart-item-details">
          <div>
            <h4 class="cart-item-name">${item.name}</h4>
            <p class="cart-item-price">${item.price.toLocaleString()}</p>
          </div>
          <div class="cart-item-actions">
            <div class="qty-controls">
              <button class="qty-btn" data-action="decrease" data-id="${item.id}">−</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-btn" data-action="increase" data-id="${item.id}">+</button>
            </div>
            <button class="btn-remove" data-id="${item.id}">Remove</button>
          </div>
        </div>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateQuantity(btn.dataset.id, btn.dataset.action === 'increase' ? 1 : -1);
      });
    });

    container.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
    });
  }

  // ========== CART PANEL ==========

  const cartToggle = document.getElementById('cartToggle');
  const cartPanel = document.getElementById('cartPanel');
  const cartBackdrop = document.getElementById('cartBackdrop');
  const cartClose = document.getElementById('cartClose');
  const btnContinue = document.getElementById('btnContinue');
  const btnCheckout = document.getElementById('btnCheckout');

  function openCart() {
    if (!cartPanel) return;
    cartPanel.classList.add('active');
    cartBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    renderCartItems();
  }

  function closeCart() {
    if (!cartPanel) return;
    cartPanel.classList.remove('active');
    cartBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (cartToggle) cartToggle.addEventListener('click', openCart);
  if (cartClose) cartClose.addEventListener('click', closeCart);
  if (cartBackdrop) cartBackdrop.addEventListener('click', closeCart);
  if (btnContinue) btnContinue.addEventListener('click', closeCart);

  // ========== PRODUCT RENDERING ==========

  function buildProductCard(product) {
    // Ensure we handle arrays safely, fallback to a single string or placeholder if empty
    const imageArray = Array.isArray(product.image) ? product.image : [product.image];
    const firstImage = imageArray[0] || FALLBACK_IMAGE;

    return `
        <article class="product-card reveal" data-id="${product.id}">
            ${
                product.status === 'out-of-stock'
                ? '<span class="product-badge out">Sold Out</span>'
                : '<span class="product-badge in-stock">Available</span>'
            }
            <div class="product-card-img" style="position: relative; overflow: hidden;">
                <!-- Main Image displaying the current view -->
                <img src="${firstImage}" 
                     class="product-carousel-img" 
                     data-current-index="0" 
                     data-images='${JSON.stringify(imageArray)}' 
                     style="width: 100%; display: block;" />
                
                <!-- Navigation Buttons (Only render if there's more than 1 image) -->
                ${imageArray.length > 1 ? `
                    <button class="carousel-btn prev-btn" onclick="moveCarousel(this, -1, event)" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; z-index: 2;">&#10094;</button>
                    <button class="carousel-btn next-btn" onclick="moveCarousel(this, 1, event)" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; z-index: 2;">&#10095;</button>
                ` : ''}
            </div>
            
            <!-- Rest of your product card details below (name, price, etc.) -->
    `;
}

  /** Render the full product grid (collection.html) */
  function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    const products = getProducts();

    if (products.length === 0) {
      grid.innerHTML = `
        <div class="no-data" style="grid-column: 1 / -1;">
          <p>No fragrances available at the moment. Check back soon.</p>
        </div>`;
      return;
    }

    grid.innerHTML = products.map(buildProductCard).join('');
    attachProductCardEvents(grid);
    observeRevealElements();
  }

  /** Render a limited "featured" preview grid (index.html) */
  async function renderFeaturedProducts() {
    const grid = document.getElementById('featuredGrid');
    if (!grid) return;

    try {
        // 1. Fetch products from your Node/Express backend on Render
        // Note: window.AURA_API_BASE already includes '/api', so we just append '/products'
        const response = await fetch(`${window.AURA_API_BASE}/products`);
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        let products = await response.json();

        // 2. Client-side filter to only show featured items in this specific section
        if (Array.isArray(products)) {
            products = products.filter(p => p.is_featured === true || p.is_featured === 'true').slice(0, 4);
        }

        // 3. Handle empty fallback state
        if (!products || products.length === 0) {
            grid.innerHTML = `
                <div class="no-data" style="grid-column: 1 / -1;">
                    <p>No featured fragrances available at the moment. Check back soon.</p>
                </div>`;
            return;
        }

        // 4. Map through data using your updated multi-image card builder
        grid.innerHTML = products.map(buildProductCard).join('');

        // 5. Fire actions and kick off your automated crossfade carousel
        attachProductCardEvents(grid);
        observeRevealElements();
        initAutoImageSwapper(4000);

    } catch (err) {
        console.error("Error rendering featured collection:", err.message);
    }
  }

  /** Attach add-to-cart and card-click (detail modal) events within a grid */
  function attachProductCardEvents(grid) {
    grid.querySelectorAll('.btn-add-cart').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const productId = btn.dataset.id;
        addToCart(productId);

        btn.textContent = 'Added!';
        btn.classList.add('added');
        setTimeout(() => {
          btn.textContent = 'Add to Cart';
          btn.classList.remove('added');
        }, 1500);
      });
    });

    grid.querySelectorAll('.product-card').forEach((card) => {
      card.addEventListener('click', () => openProductDetail(card.dataset.id));
    });
  }

  // ========== PRODUCT DETAIL MODAL ==========

  const detailModal = document.getElementById('detailModal');
  const detailModalClose = document.getElementById('detailModalClose');

  function buildNotesRow(label, value) {
    if (!value) return '';
    return `
      <div class="note-row">
        <span class="note-label">${label}</span>
        <span class="note-value">${value}</span>
      </div>
    `;
  }

  function openProductDetail(productId) {
    if (!detailModal) return;
    const product = getProducts().find((p) => p.id === productId);
    if (!product) return;

    const inStock = product.status !== 'out-of-stock';
    const notesHTML =
      buildNotesRow('Top', product.topNotes) +
      buildNotesRow('Heart', product.heartNotes) +
      buildNotesRow('Base', product.baseNotes);

    // Safely pulls the first image string out of your array or uses the fallback link
    detailModal.querySelector('.detail-modal-img img').src = Array.isArray(product.image) ? product.image[0] : product.image;
    detailModal.querySelector('.detail-modal-img img').alt = product.name;
    detailModal.querySelector('.detail-modal-img img').onerror = function () {
      this.src = FALLBACK_IMAGE;
    };
    detailModal.querySelector('.detail-badge').textContent = inStock ? 'Available' : 'Sold Out';
    detailModal.querySelector('.detail-badge').classList.toggle('out', !inStock);
    detailModal.querySelector('.detail-modal-name').textContent = product.name;
    detailModal.querySelector('.detail-modal-price').textContent = `${product.price.toLocaleString()}`;
    detailModal.querySelector('.detail-modal-desc').textContent = product.description;

    const notesBlock = detailModal.querySelector('.notes-pyramid');
    const notesTitle = detailModal.querySelector('.notes-title');
    if (notesHTML.trim()) {
      notesBlock.innerHTML = notesHTML;
      notesBlock.style.display = '';
      notesTitle.style.display = '';
    } else {
      notesBlock.style.display = 'none';
      notesTitle.style.display = 'none';
    }

    const addBtn = detailModal.querySelector('.btn-add-cart');
    addBtn.dataset.id = product.id;
    addBtn.disabled = !inStock;
    addBtn.textContent = inStock ? 'Add to Cart' : 'Sold Out';

    detailModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeProductDetail() {
    if (!detailModal) return;
    detailModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (detailModal) {
    detailModal.querySelector('.btn-add-cart').addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      if (e.currentTarget.disabled) return;
      addToCart(id);
      e.currentTarget.textContent = 'Added!';
      setTimeout(() => {
        e.currentTarget.textContent = 'Add to Cart';
      }, 1500);
    });
  }

  if (detailModalClose) detailModalClose.addEventListener('click', closeProductDetail);
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) closeProductDetail();
    });
  }

  // ========== CHECKOUT MODAL ==========

  const checkoutModal = document.getElementById('checkoutModal');
  const modalClose = document.getElementById('modalClose');
  const checkoutForm = document.getElementById('checkoutForm');
  const modalOrderSummary = document.getElementById('modalOrderSummary');

  function openCheckout() {
    if (!checkoutModal) return;
    if (cart.length === 0) {
      showToast('Your cart is empty', 'error');
      return;
    }

    closeCart();

    const summaryHTML = `
      <p style="font-size:0.75rem; letter-spacing:2px; text-transform:uppercase; color:var(--cream-muted); margin-bottom:12px;">Order Summary</p>
      ${cart
        .map(
          (item) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="color:var(--cream);">${item.name} <span style="color:var(--white-faint);">×${item.quantity}</span></span>
          <span style="color:var(--gold); font-weight:600;">${(item.price * item.quantity).toLocaleString()}</span>
        </div>
      `
        )
        .join('')}
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0 0; margin-top:8px;">
        <span style="color:var(--cream); font-weight:600;">Total</span>
        <span style="color:var(--gold); font-family:var(--font-display); font-size:1.2rem; font-weight:700;">${getCartTotal().toLocaleString()}</span>
      </div>
    `;
    modalOrderSummary.innerHTML = summaryHTML;

    checkoutModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeCheckout() {
    if (!checkoutModal) return;
    checkoutModal.classList.remove('active');
    document.body.style.overflow = '';
    checkoutForm.reset();
  }

  if (btnCheckout) btnCheckout.addEventListener('click', openCheckout);
  if (modalClose) modalClose.addEventListener('click', closeCheckout);
  if (checkoutModal) {
    checkoutModal.addEventListener('click', (e) => {
      if (e.target === checkoutModal) closeCheckout();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCheckout();
      closeCart();
      closeProductDetail();
    }
  });

  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const orderRequest = {
        items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
        customerName: document.getElementById('custName').value.trim(),
        email: document.getElementById('custEmail').value.trim(),
        phone1: document.getElementById('custPhone1').value.trim(),
        phone2: document.getElementById('custPhone2').value.trim(),
        address: document.getElementById('custAddress').value.trim(),
      };

      if (!orderRequest.customerName || !orderRequest.email || !orderRequest.phone1 || !orderRequest.address) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      const submitBtn = document.getElementById('submitOrder');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Placing Order…';
      }

      try {
        await submitOrder(orderRequest);
        clearCart();
        updateCartUI();
        closeCheckout();
        showToast(`Order placed successfully! We'll contact you shortly to confirm delivery.`, 'success');
      } catch (err) {
        showToast(err.message || 'Could not place order. Please try again.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Place Order';
        }
      }
    });
  }

  // ========== PARALLAX EFFECT (Home hero only) ==========

  function initParallax() {
    const heroBg = document.getElementById('heroBg');
    const hero = document.getElementById('hero');
    if (!heroBg || !hero) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrolled = window.pageYOffset;
          const heroHeight = hero.offsetHeight;
          if (scrolled < heroHeight) {
            heroBg.style.transform = `translate3d(0, ${scrolled * 0.4}px, 0)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ========== NAVBAR ==========

  function initNavbar() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.pageYOffset > 80);
    });

    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
      });

      navLinks.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
          navLinks.classList.remove('open');
        });
      });
    }
  }

  // ========== SCROLL REVEAL ==========

  function observeRevealElements() {
    const reveals = document.querySelectorAll('.reveal:not(.visible)');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    reveals.forEach((el) => observer.observe(el));
  }

  // ========== TOAST NOTIFICATIONS ==========

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

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

  // ========== CONTACT FORM (contact.html — client-side only) ==========

 function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Dynamically grab inputs inside the form
    const nameEl = form.querySelector('input[type="text"]') || document.getElementById('contactName');
    const emailEl = form.querySelector('input[type="email"]') || document.getElementById('contactEmail');
    const messageEl = form.querySelector('textarea') || document.getElementById('contactMessage');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const message = messageEl ? messageEl.value.trim() : '';

    if (!name || !email || !message) {
      showToast('Please fill out all fields.', 'error');
      return;
    }

    try {
      // Use your configured API URL base, defaulting to the live Render backend
      const API_BASE = typeof API_URL !== 'undefined' ? API_URL : 'https://auradescents.onrender.com/api';
      
      const response = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send your message.');
      }

      showToast('Message sent! We will be in touch shortly.', 'success');
      form.reset();
    } catch (err) {
      console.error('Contact Form Error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
    }
  });
 }

  // ========== INITIALIZE ==========

  async function init() {
    loadCart();
    await fetchProducts();
    renderProducts();
    renderFeaturedProducts();
    updateCartUI();
    initParallax();
    initNavbar();
    initContactForm();
    observeRevealElements();

    // Cart is still per-browser via localStorage, so keep multi-tab sync for it.
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.CART) {
        loadCart();
        updateCartUI();
        renderCartItems();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/** Global Image Auto-Swapping Loop */
function initAutoImageSwapper(intervalTime = 4000) {
    if (window.carouselIntervalActive) return;
    window.carouselIntervalActive = true;

    setInterval(() => {
        const structuralImages = document.querySelectorAll('.product-carousel-img');
        
        structuralImages.forEach(img => {
            // Safe parsing of the images array from the element data attribute
            let images;
            try {
                images = JSON.parse(img.getAttribute('data-images'));
            } catch(e) { return; }
            
            if (!images || images.length <= 1) return; 
            
            let currentIndex = parseInt(img.getAttribute('data-current-index') || '0');
            currentIndex = (currentIndex + 1) % images.length; 
            
            img.style.opacity = 0.4;
            setTimeout(() => {
                img.src = images[currentIndex];
                img.setAttribute('data-current-index', currentIndex);
                img.style.opacity = 1;
            }, 200);
        });
    }, intervalTime);
}

