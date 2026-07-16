# Aura De Scents — Backend

Your site was 100% client-side: products, orders, and even the admin password
lived in the browser (`localStorage`/hardcoded JS). That meant:
- Anyone could open DevTools and see the admin password (`admin` / `aura2024`) in `dashboard.js`.
- Anyone could open DevTools and edit their own cart/order prices before checkout.
- Products and orders were per-browser — customers on different devices didn't share a catalog, and you'd lose all orders if you cleared your browser data.

This adds a real backend that fixes all three problems, backed by **Supabase**
(Postgres database + file storage) and deployable to **Render**.

## What's here

```
backend/    Node.js + Express API, Postgres (via Supabase) + Supabase Storage
frontend/   Your original site, lightly modified to call the API instead of localStorage
```

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Database** → Project Settings → Database → copy the **Connection string (URI)**. This becomes `DATABASE_URL`.
   - If your host limits concurrent DB connections, use the **connection pooler** string (port `6543`) instead of the direct one (port `5432`). 
3. **Storage** → create a new bucket named `product-images` → mark it **Public** (so uploaded photos are viewable without auth).
4. **API keys** → Project Settings → API → copy the **Project URL** (`SUPABASE_URL`) and the **`service_role` key** (``).
   - The service_role key is server-only — never put it in frontend code or commit it.

## 2. Run the backend locally

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — your Supabase connection string
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET` — from step 1
- `JWT_SECRET` — generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — your real admin login (only used once, to create the account)
- `CORS_ORIGIN` — the URL(s) your frontend will be served from

Then:

```bash
npm run seed   # creates tables in Supabase, default products, and your admin account
npm start      # starts the API on http://localhost:4000
```

Health check: `curl http://localhost:4000/api/health`

## 3. Deploy the backend to Render

1. Push this repo to GitHub.
2. Render → New → Web Service → connect the repo.
3. **Root Directory**: `backend`
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. Add all the env vars from your `.env` under Render's Environment tab (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CORS_ORIGIN`). Render sets `PORT` itself.
7. First deploy: use Render's **Shell** tab to run `npm run seed` once against the live database (or run it locally pointed at the same `DATABASE_URL` before deploying).
8. Note your Render URL, e.g. `https://aura-de-scents-api.onrender.com`.

## 4. Run the frontend

The frontend is still static files — open `frontend/index.html` directly, or serve the folder with any static server, e.g.:

```bash
cd frontend
npx serve .
```

Point it at your backend in `frontend/api-config.js`:

```js
window.AURA_API_BASE = 'https://aura-de-scents-api.onrender.com/api';
```

And make sure `CORS_ORIGIN` on Render includes wherever this frontend ends up hosted (Netlify, GitHub Pages, etc.), not just `localhost`.

## 5. Log into the dashboard

Go to `dashboard.html` and log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in `.env`. The password is hashed (bcrypt) and stored in the database — it's never sent to the browser or visible in any JS file. Sessions use a JWT that expires after 12 hours.

## API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | — | Get an admin JWT |
| GET | `/api/products` | — | List products |
| GET | `/api/products/:id` | — | One product |
| POST | `/api/products` | admin | Create product |
| PUT | `/api/products/:id` | admin | Update product |
| DELETE | `/api/products/:id` | admin | Delete product |
| POST | `/api/products/upload-image` | admin | Upload a product photo to Supabase Storage, returns its public URL |
| POST | `/api/orders` | — | Place an order (prices are re-verified server-side) |
| GET | `/api/orders` | admin | List all orders |
| PATCH | `/api/orders/:id/status` | admin | Cycle/set order status |

## What changed, and why

- **Real database (Postgres via Supabase)** instead of `localStorage` — products/orders persist on the server and are shared across every visitor and device.
- **Persistent image storage (Supabase Storage)** instead of saving files to local disk — Render's filesystem is wiped on every redeploy, so uploaded photos would otherwise disappear. Images now live in a Supabase bucket and the database stores their public URL.
- **Hashed admin password + JWT auth** instead of a hardcoded username/password sitting in plain JS. Login attempts are rate-limited (10 per 15 minutes) to slow down brute-forcing.
- **Server-recomputed order totals** — the API looks up each product's real price from the database when an order is placed, so a customer can't tamper with cart data in DevTools to pay less.
- **Real transactions** — placing an order and inserting its line items happen inside a single Postgres `BEGIN`/`COMMIT`, so a failure partway through can't leave an order with missing items.
- The shopping **cart itself stays in the browser's `localStorage`** — that's a reasonable place for a not-yet-purchased cart to live, and needs no server change.

## Next steps worth considering

- Add HTTPS in front of the API if you move off Render (Render provides it by default).
- Add row-level security policies in Supabase if you ever query the database directly from the frontend instead of through this API.
- Consider email notifications on new orders (e.g. via SendGrid) since the dashboard needs to be actively checked right now.
- If traffic grows, watch Supabase's connection limits — switch fully to the pooled connection string if you haven't already.
