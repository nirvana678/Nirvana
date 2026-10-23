# Nirvana implementation plan

## Delivered in this workspace

- Responsive pink shop and salon storefront with locally bundled sample photos and fonts.
- Admin editing for homepage sections, theme and store text, catalogue, categories, brands, services, salonist portraits/hours, orders, customers and appointments.
- Focused cart and checkout with delivery or pickup at Moi University, Eldoret. Product colours and variants are recorded on orders.
- Larger swipeable flash offers with automatic sliding, manual arrows and reduced-motion support.
- Related salon product prompt at checkout success, phone-friendly pink receipt download and customer order history.
- Salonist-specific schedule and private staff login, plus links to open a salonist WhatsApp conversation.
- Brevo email adapter for order PDFs and appointment confirmations. Email status is stored and admins can retry.

## Before live launch

1. Replace demonstration images, catalogue details, salonist portraits, hours and phone numbers from the admin dashboard.
2. Add a verified Brevo sender and API key to `backend/.env`; send real order and booking emails to confirm delivery.
3. Review pickup instructions and delivery fees in Store settings. Check actual salon opening days and every salonist service mapping.
4. Deploy the frontend and API with HTTPS and a persistent MongoDB replica set so customers can use the site away from the shop Wi-Fi. Add backups and monitoring.
5. For online payment, integrate and verify a payment provider callback before displaying a paid state. Current checkout collects payment on delivery or pickup.
6. Add dedicated variant stock, discounts with campaign start/end times, optional customer appointment changes and operational reports as follow-on features.
