# Nirvana Beauty Shop & Salon

Angular storefront and salon booking experience backed by an Express REST API and MongoDB. Nirvana is based at Moi University, Eldoret, Uasin Gishu, Kenya.

## Requirements

- Node.js 22.22+ or 24.15+ (Angular 22 requirement)
- MongoDB 7+; a replica set is recommended and required for transactional checkout and appointment writes
- npm 10+

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI`, a long random `JWT_SECRET`, and `ADMIN_SETUP_KEY`.
2. Install dependencies from the project root with `npm install` (or run `npm install` inside each app folder for separate installs).
3. Start MongoDB. For transactions, configure it as a replica set (for a single-node development database, use `mongod --replSet rs0` and initialize it with `rs.initiate()`, then use `mongodb://127.0.0.1:27017/nirvana?replicaSet=rs0`).
4. Seed demonstration catalog, categories, brands, salon services and salonists with `npm run seed` from the root, or `npm run seed` from `backend`.
5. Run `npm start` from the repository root to start both apps, or run `npm start` independently inside `backend` and `frontend`. The Angular app is at http://localhost:4200 and the API health endpoint is http://localhost:4000/api/health. Restart both processes after pulling code changes.

On a phone connected to the same Wi-Fi, open `http://<your-computer-LAN-IP>:4200`. The Angular dev server listens on all interfaces and proxies `/api` to the backend. The phone cannot use `localhost` to reach the computer. For access outside the Wi-Fi network, deploy the frontend and backend behind HTTPS.

To build the frontend and run backend syntax checks, use `npm run build` from the root, or `npm run build` from `frontend`. Run the backend business-rule unit tests with `npm test` inside `backend`. Set `CLIENT_ORIGIN` to the deployed storefront origin(s), separated by commas, before production use.

## Secure first administrator

Open `/admin` on desktop or phone and sign in with an administrator account. The local development administrator created for this workstation is recorded in the ignored `ADMIN-ACCESS.local.txt` file. Change its password in **My password** before sharing the site. For another installation, set a one-time `ADMIN_SETUP_KEY` and send `POST /api/admin/setup` with header `x-admin-setup-key` and a name, email and password (8+ characters); setup only works while no admin exists.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/products`, `GET /api/products/:idOrSlug`, `GET /api/categories`, `GET /api/brands`
- `GET /api/salon/services`, `GET /api/salon/salonists`, `GET /api/salon/availability`
- Authenticated: `POST /api/orders`, `GET /api/orders/mine`, `GET /api/orders/:id/receipt.pdf`, `POST /api/salon/appointments`, `GET /api/salon/appointments/mine`
- Salonist: `GET /api/salonist/appointments`, `PATCH /api/salonist/appointments/:id`
- Admin: dashboard, store settings, homepage sections, products, categories, brands, salon services, salonists, customers, orders, appointments and photo uploads. Create or reset a staff login in the salonist editor.
- `GET /api/gallery` returns published salon work. Admins manage gallery photos in the business studio.
- Admin payments view reads verified online attempts, orders awaiting payment, and salon appointments awaiting payment.

All prices are Kenyan shillings. Product availability and order totals are calculated on the API. Orders deduct inventory transactionally and begin with pending payment status. Salon appointments are checked and written in a Mongo transaction; a schedule version write serializes competing bookings for the same salonist. Configure MongoDB as a replica set for these operations.

## Integrations and production configuration

Product, salon, gallery and branding photos uploaded from the admin studio use Cloudinary when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are set. Create a Cloudinary account, find these values in the Cloudinary dashboard, and add all three as backend environment variables in Render. Uploaded images are then stored outside the Render service filesystem and their permanent HTTPS URLs are saved with the content records. Keep these credentials private. For local development without Cloudinary credentials, uploads use the ignored `backend/uploads` folder; production deliberately rejects uploads until persistent Cloudinary storage is configured.

For Brevo, verify a sender in Brevo and set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and optionally `BREVO_SENDER_NAME` in `backend/.env`. Restart the API. New orders send a pink, phone-friendly PDF receipt and appointments send a confirmation email. The admin list shows each email status; admins can retry sending from an order or appointment editor. Without valid Brevo values, orders and bookings still save and email status is `not-configured`. Checkout supports pay on delivery or collection, so placing an order does **not** mean it has been paid.

The shop and salons can be updated in the admin dashboard: content sections, banners, text, theme colour, images, items, brands, shades, services, salonists, hours, contact and delivery settings. Staff sign in at `/login` and are taken to `/studio`, where they see only their own appointments. Each salonist can have a WhatsApp number on their profile. A WhatsApp conversation does not create an app appointment automatically; staff should enter any confirmed WhatsApp booking in the admin dashboard to reserve the time.

## Private client and salonist chat

Clients sign in, open **Salon & Spa**, then tap **Chat in app** on a salonist profile. They can also open `/messages` to see their conversations. A product can be added to the cart only after sign-in; each account has its own local cart.

## Salon work gallery and payment records

Use **Our work gallery** in the business studio to upload Nirvana's own JPG, PNG or WebP photos, add a title, category and salonist credit, and publish them. Published photos appear on `/gallery`; a preview appears on the homepage. The gallery starts empty until real work is uploaded, so demonstration photos are not presented as client results.

Use **Payments** in the business studio to review online payment attempts and verified status, orders awaiting online or delivery payment, and salon appointments awaiting payment. This is a read-only view; payment status is set by the payment verification flow. Sign-in and account creation are visible above the storefront when someone is signed out.

An administrator adds a salonist in `/admin`, enters their email, saves the profile, then uses **Create / reset staff login** in that salonist's editor. Share the one-time password privately. The salonist signs in at `/login` on a computer or phone and is sent to `/studio`. **Open client messages** leads to `/messages`; the **Chat with client** button on an appointment opens a conversation with that booked client. Staff can see only their own appointments and messages. Messages refresh while the page is open.

## Online payments

Checkout offers pay on delivery or collection, and pay online before delivery or collection. A client can also open **Payments** inside a salonist chat to pay for an appointment with that salonist. The payment prompt is sent to the client's Kenyan mobile money number. The order or appointment remains unpaid until the backend verifies the transaction with the provider. Failed payments can be retried.

To enable online payments, set `PAYHERO_API_USERNAME`, `PAYHERO_API_PASSWORD`, and the numeric PayHero **Payment Channel ID** as `PAYHERO_CHANNEL_ID` in `backend/.env`. This is the channel ID shown in PayHero under **Payment Channels → My Payment Channels**, not an account ID. Set `PUBLIC_API_URL` to the backend's public HTTPS origin so callbacks can reach `/api/payments/callback`. Without credentials the online option is disabled, and the pay-on-delivery option remains available. Payment credentials stay on the server. For local development without a public callback, the open payment page polls the provider status endpoint; production needs a public HTTPS URL to receive callbacks when the browser is closed.

See [PAYHERO.md](PAYHERO.md) for the complete STK Push request, callback payload, configuration, abuse protections, and troubleshooting guidance.

The bundled catalog photos are demonstration content. Replace them with product, brand and salonist images that Nirvana has rights to use before launch.

## Deployment notes

The repository includes `render.yaml` for the backend web service. Push the repository to GitHub, then in Render choose **New → Blueprint** and select `nirvana678/Nirvana`. Render reads the Blueprint and creates the API service in Frankfurt, with `/api/health` as its deploy health check. Enter a production MongoDB Atlas replica-set URI for `MONGODB_URI` and the Cloudinary, PayHero and callback settings requested by the Blueprint. Never use the local `127.0.0.1` MongoDB URI on Render; it refers to the Render container itself. Keep `.env` files and provider secrets out of Git.

The Blueprint uses Render's Free plan to allow a no-cost initial deployment. Render spins Free web services down after 15 minutes without inbound traffic, so the first request after inactivity can take time. Upgrade the service to a paid instance for a continuously available live checkout. The backend needs a MongoDB replica set for checkout and appointment transactions; use a managed MongoDB Atlas cluster in a region close to Frankfurt.

The frontend production build calls `https://api.nirvanabeautyshop.com/api`. After Render creates the API, add `api.nirvanabeautyshop.com` in the service's **Settings → Custom Domains**, then add the exact DNS record Render provides in Namecheap Advanced DNS. Wait for Render to verify the domain and issue TLS before testing the custom API URL. Host the frontend separately on Cloudflare Pages at `nirvanabeautyshop.com`; the API allows the root and `www` origins in CORS. Publish `frontend/dist/nirvana/browser` and configure SPA fallback to `index.html`.

Do not start online payment collection until the public API domain is live and reachable, `PUBLIC_API_URL` is set to `https://api.nirvanabeautyshop.com`, and the PayHero callback is verified. Cloudinary credentials must be set on Render for admin image uploads to persist. Configure monitoring, backups and rate limits before launch.

## Current implementation scope

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for delivered features and launch work.
