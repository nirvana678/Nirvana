const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { User, Product, Order, SalonService, Salonist, Appointment, Payment, Category, Brand, FlashSale } = require('../models');
const { authenticate, allow } = require('../middleware');
const { calculateOrderTotals } = require('../domain');
const { Section, GalleryWork, StoreSettings } = require('../models/content');
const { receiptPdf } = require('../receipt');
const { sendOrderEmail, sendAppointmentEmail } = require('../notifications');
const { configured: onlinePaymentsConfigured } = require('./payments');
const api = express.Router();
const auth = express.Router();
const objectId = (id) => /^[a-f\d]{24}$/i.test(String(id));
const tokenFor = (user) => jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role });

auth.post('/register', async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().max(180), password: z.string().min(8).max(128), phone: z.string().max(30).optional() }).parse(req.body);
    if (await User.exists({ email: body.email.toLowerCase() })) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = await User.create({ ...body, email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(body.password, 12) });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: e.issues[0].message }); next(e); }
});
auth.post('/login', async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
    if (!user || user.status !== 'active' || !await bcrypt.compare(input.password, user.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: 'Enter a valid email and password.' }); next(e); }
});
auth.get('/me', authenticate, async (req, res, next) => { try { const user = await User.findById(req.auth.sub); if (!user) return res.status(401).json({ error: 'Account not found.' }); res.json(publicUser(user)); } catch (e) { next(e); } });
auth.post('/password', authenticate, async (req, res, next) => {
  try {
    const input=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(8).max(128)}).parse(req.body);
    const user=await User.findById(req.auth.sub).select('+passwordHash');
    if(!user || !await bcrypt.compare(input.currentPassword,user.passwordHash)) return res.status(400).json({error:'Your current password is incorrect.'});
    user.passwordHash=await bcrypt.hash(input.newPassword,12);await user.save();res.json({message:'Password updated.'});
  }catch(e){next(e)}
});

api.get('/storefront', async (req, res, next) => {
  try {
    const [settings, sections, categories, brands] = await Promise.all([StoreSettings.findOne({key:'store'}).select('-key -__v').lean(),Section.find({enabled:true}).sort({sortOrder:1,createdAt:1}).populate({path:'featuredProducts',match:{published:true},select:'name brand category image price compareAt stock published'}).lean(),Category.find({active:true}).sort({sortOrder:1}).lean(),Brand.find().sort({name:1}).lean()]);
    res.json({settings:settings || {},sections,categories,brands});
  } catch(e) { next(e); }
});
api.get('/gallery', async (req, res, next) => {
  try { res.json(await GalleryWork.find({ published: true }).select('title category description artistName image featured sortOrder').sort({ featured: -1, sortOrder: 1, createdAt: -1 }).lean()); }
  catch (e) { next(e); }
});
api.get('/products', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));
    const filter = { published: true };
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.q) filter.$text = { $search: String(req.query.q).slice(0, 80) };
    if (req.query.brand) filter.brand = String(req.query.brand);
    if (req.query.min || req.query.max) filter.price = { ...(req.query.min ? { $gte: Number(req.query.min) } : {}), ...(req.query.max ? { $lte: Number(req.query.max) } : {}) };
    const sort = req.query.sort === 'price-asc' ? { price: 1 } : req.query.sort === 'price-desc' ? { price: -1 } : req.query.sort === 'newest' ? { createdAt: -1 } : { featured: -1, sortOrder: 1, createdAt: -1 };
    const [items, total] = await Promise.all([Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(filter)]);
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (e) { next(e); }
});
api.get('/products/:idOrSlug', async (req, res, next) => { try { const key = req.params.idOrSlug; const product = await Product.findOne(objectId(key) ? { _id: key, published: true } : { slug: key, published: true }).lean(); if (!product) return res.status(404).json({ error: 'Product not found.' }); res.json(product); } catch (e) { next(e); } });
api.get('/categories', async (req, res, next) => { try { res.json(await Category.find({ active: true }).sort({ sortOrder: 1 }).lean()); } catch (e) { next(e); } });
api.get('/brands', async (req, res, next) => { try { res.json(await Brand.find().sort({ name: 1 }).lean()); } catch (e) { next(e); } });
api.get('/salon/services', async (req, res, next) => { try { res.json(await SalonService.find({ active: true }).sort({ name: 1 }).lean()); } catch (e) { next(e); } });
api.get('/salon/salonists', async (req, res, next) => { try { const artists = await Salonist.find({ active: true }).select('name bio phone specialties services image workDays startHour endHour user').populate('services', 'name price durationMinutes').populate('user', 'status').lean(); res.json(artists.map(({user,...artist})=>({...artist,chatAvailable:user?.status==='active'}))); } catch (e) { next(e); } });
api.get('/salon/availability', async (req, res, next) => {
  try {
    const { date, serviceId, salonistId } = req.query;
    if (!date || !serviceId || !objectId(serviceId) || (salonistId && !objectId(salonistId))) return res.status(400).json({ error: 'Choose a date and service.' });
    const service = await SalonService.findById(serviceId); if (!service) return res.status(404).json({ error: 'Service not found.' });
    const dayStart = new Date(`${date}T00:00:00`), dayEnd = new Date(`${date}T23:59:59.999`);
    if (!Number.isFinite(dayStart.getTime())) return res.status(400).json({ error: 'Choose a valid date.' });
    const professionals = await Salonist.find({ active: true, ...(salonistId ? { _id: salonistId } : {}), services: service._id });
    const appointments = await Appointment.find({ salonist: { $in: professionals.map(p => p._id) }, status: { $in: ['confirmed', 'pending'] }, startsAt: { $lt: dayEnd }, endsAt: { $gt: dayStart } }).select('salonist startsAt endsAt').lean();
    const slots = [];
    for (let hour = 0; hour < 24; hour++) for (const minute of [0, 30]) {
      const start = new Date(dayStart); start.setHours(hour, minute, 0, 0); const end = new Date(start.getTime() + service.durationMinutes * 60000);
      if (start <= new Date()) continue;
      const startMinutes=hour*60+minute, endMinutes=startMinutes+service.durationMinutes;
      const available = professionals.find(p => p.workDays.includes(start.getDay()) && startMinutes >= p.startHour*60 && endMinutes <= p.endHour*60 && !appointments.some(a => String(a.salonist) === String(p._id) && a.startsAt < end && a.endsAt > start));
      if (available) slots.push({ startsAt: start, endsAt: end, salonist: { id: available.id, name: available.name } });
    }
    res.json(slots);
  } catch (e) { next(e); }
});

api.post('/orders', authenticate, async (req, res, next) => {
  const session = await Product.startSession();
  try {
    const input = z.object({ items: z.array(z.object({ productId: z.string().refine(objectId), quantity: z.number().int().min(1).max(20), colour:z.string().max(80).optional(), variant:z.string().max(80).optional() })).min(1).max(30), fulfilment:z.enum(['delivery','pickup']).default('delivery'), delivery: z.object({ name: z.string().trim().min(2), email: z.string().email(), phone: z.string().min(7), address: z.string().max(200).default(''), room:z.string().max(100).default(''), landmark:z.string().max(100).default(''), county: z.string().max(100).default(''), town: z.string().max(100).default(''), instructions: z.string().max(500).optional() }), paymentMethod: z.enum(['cash-on-delivery','online']) }).parse(req.body);
    if (input.paymentMethod === 'online' && !onlinePaymentsConfigured()) return res.status(503).json({error:'Online payments are being set up. Please choose pay on delivery.'});
    if(input.fulfilment==='delivery' && (!input.delivery.address.trim()||!input.delivery.county.trim()||!input.delivery.town.trim()))return res.status(400).json({error:'Enter your delivery address, town and county.'});
    let created;
    await session.withTransaction(async () => {
      const items = [];
      for (const line of input.items) {
        const product = await Product.findOneAndUpdate({ _id: line.productId, published: true, stock: { $gte: line.quantity } }, { $inc: { stock: -line.quantity } }, { new: true, session });
        if (!product) throw Object.assign(new Error('One or more items are unavailable in the requested quantity.'), { status: 409 });
        const unitPrice = product.compareAt && product.compareAt > product.price ? product.price : product.price;
        if(line.colour && !product.colours.includes(line.colour))throw Object.assign(new Error('Choose a valid product colour.'),{status:400});
        if(line.variant && !product.variants.includes(line.variant))throw Object.assign(new Error('Choose a valid product variation.'),{status:400});
        items.push({ product: product._id, name: product.name, sku: product.sku, colour:line.colour||'', variant:line.variant||'', quantity: line.quantity, unitPrice, lineTotal: unitPrice * line.quantity });
      }
      const settings = await StoreSettings.findOne({key:'store'}).session(session);
      const totals = calculateOrderTotals(items.map(item => ({ quantity: item.quantity, unitPrice: item.unitPrice })), settings?.freeDeliveryAt ?? 5000, settings?.deliveryFee ?? 250);
      const orderNumber = `NIR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      [created] = await Order.create([{ orderNumber, customer: req.auth.sub, items, ...totals, deliveryFee:input.fulfilment==='pickup'?0:totals.deliveryFee,total:input.fulfilment==='pickup'?totals.subtotal:totals.total, fulfilment:input.fulfilment, paymentMethod: input.paymentMethod, delivery: input.delivery }], { session });
    });
    res.status(201).json(created);void sendOrderEmail(created._id).catch(e=>console.error('Order notification:',e));
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: e.issues[0].message }); next(e); } finally { await session.endSession(); }
});
api.get('/orders/mine', authenticate, async (req, res, next) => { try { res.json(await Order.find({ customer: req.auth.sub }).sort({ createdAt: -1 }).lean()); } catch (e) { next(e); } });
api.get('/orders/:id/receipt.pdf', authenticate, async(req,res,next)=>{
  try{
    if(!objectId(req.params.id))return res.status(400).json({error:'Invalid order.'});
    const order=await Order.findById(req.params.id).lean();
    if(!order || (String(order.customer)!==req.auth.sub && req.auth.role!=='admin'))return res.status(404).json({error:'Order not found.'});
    if(order.paymentStatus!=='paid')return res.status(409).json({error:'A receipt is available after payment is confirmed.'});
    const settings=await StoreSettings.findOne({key:'store'}).lean()||{};
    const pdf=receiptPdf(order,settings);
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Nirvana-${order.orderNumber}.pdf"`,'Content-Length':String(pdf.length),'Cache-Control':'private, no-store'}).end(pdf);
  }catch(e){next(e)}
});
api.post('/salon/appointments', authenticate, async (req, res, next) => {
  const session = await Appointment.startSession();
  try {
    const input = z.object({ serviceId: z.string().refine(objectId), salonistId: z.string().refine(objectId), startsAt: z.string().datetime(), customerName: z.string().min(2), customerPhone: z.string().min(7), productId:z.string().refine(objectId).optional() }).parse(req.body);
    let created;
    await session.withTransaction(async () => {
      const service = await SalonService.findOne({ _id: input.serviceId, active: true }).session(session); const salonist = await Salonist.findOne({ _id: input.salonistId, active: true, services: input.serviceId }).session(session);
      if (!service || !salonist) throw Object.assign(new Error('That service or salonist is unavailable.'), { status: 409 });
      const startsAt = new Date(input.startsAt), endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60000);
      const startMinutes=startsAt.getHours()*60+startsAt.getMinutes(), endMinutes=startMinutes+service.durationMinutes;
      if (startsAt <= new Date() || !salonist.workDays.includes(startsAt.getDay()) || startMinutes < salonist.startHour*60 || endMinutes > salonist.endHour*60) throw Object.assign(new Error('That time is outside the salonist’s working hours.'), { status: 409 });
      // A write to the salonist document makes concurrent booking transactions conflict
      // even when they are attempting adjacent inserts in the appointment collection.
      await Salonist.updateOne({ _id: salonist._id }, { $inc: { scheduleVersion: 1 } }, { session });
      const clash = await Appointment.findOne({ salonist: salonist._id, status: { $in: ['confirmed', 'pending'] }, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }).session(session);
      if (clash) throw Object.assign(new Error('That appointment time has just been booked. Choose another time.'), { status: 409 });
      const reference = `NS-${Date.now().toString(36).toUpperCase()}`;
      if(input.productId && !await Product.exists({_id:input.productId,published:true, salonUsable:true}).session(session))throw Object.assign(new Error('This item is unavailable for salon use.'),{status:400});
      [created] = await Appointment.create([{ reference, customer: req.auth.sub, service: service._id, salonist: salonist._id, product:input.productId||null, customerName: input.customerName, customerPhone: input.customerPhone, startsAt, endsAt, price: service.price, status: 'confirmed', paymentStatus: 'pay-at-salon' }], { session });
    });
    res.status(201).json(created);void sendAppointmentEmail(created._id).catch(e=>console.error('Appointment notification:',e));
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: e.issues[0].message }); if (e.code === 11000) return res.status(409).json({ error: 'That time was just booked. Please choose another.' }); next(e); } finally { await session.endSession(); }
});
api.get('/salon/appointments/mine', authenticate, async (req, res, next) => { try { res.json(await Appointment.find({ customer: req.auth.sub }).populate('service', 'name price durationMinutes').populate('salonist', 'name image').sort({ startsAt: -1 }).lean()); } catch (e) { next(e); } });
api.get('/salonist/appointments',authenticate,allow('salonist'),async(req,res,next)=>{
  try{const artist=await Salonist.findOne({user:req.auth.sub}).select('name image');if(!artist)return res.status(404).json({error:'No salonist profile is linked to this account.'});
    const appointments=await Appointment.find({salonist:artist._id}).populate('service','name durationMinutes').populate('product','name image').populate('customer','name email phone').sort({startsAt:-1}).limit(200).lean();res.json({salonist:artist,appointments});}catch(e){next(e)}
});
api.patch('/salonist/appointments/:id',authenticate,allow('salonist'),async(req,res,next)=>{
  try{const artist=await Salonist.findOne({user:req.auth.sub});if(!artist)return res.status(404).json({error:'Salonist profile not found.'});
    const status=z.enum(['confirmed','completed','cancelled']).parse(req.body.status);
    const item=await Appointment.findOneAndUpdate({_id:req.params.id,salonist:artist._id},{status},{new:true});if(!item)return res.status(404).json({error:'Appointment not found.'});res.json(item);}catch(e){next(e)}
});

api.use('/messages', require('./chat').router);
api.use('/payments', require('./payments').router);
api.use('/assistant', require('./assistant').router);

api.use('/admin', (req, res, next) => { if (req.path === '/setup') return next(); authenticate(req, res, () => allow('admin')(req, res, next)); });
api.use('/admin', require('./management').router);
api.get('/admin/dashboard', async (req, res, next) => {
  try { const [products, orders, customers, appointments, lowStock, recentOrders, revenue] = await Promise.all([Product.countDocuments(), Order.countDocuments(), User.countDocuments({ role: 'customer' }), Appointment.countDocuments(), Product.countDocuments({ stock: { $lte: 5 } }), Order.find().sort({ createdAt: -1 }).limit(6).populate('customer', 'name email').lean(), Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }])]); res.json({ products, orders, customers, appointments, lowStock, revenue: revenue[0]?.total || 0, recentOrders }); } catch (e) { next(e); }
});
api.get('/admin/orders', async (req, res, next) => { try { res.json(await Order.find().populate('customer', 'name email phone').sort({ createdAt: -1 }).limit(100).lean()); } catch (e) { next(e); } });
api.get('/admin/payments', async (req, res, next) => {
  try {
    const [attempts, pendingOrders, pendingAppointments, paidOrders, awaitingOrders] = await Promise.all([
      Payment.find().select('reference order appointment amount phone status createdAt verifiedAt checkedAt').populate({ path: 'order', select: 'orderNumber customer delivery paymentMethod paymentStatus', populate: { path: 'customer', select: 'name email phone' } }).populate({ path: 'appointment', select: 'reference customerName service paymentStatus', populate: { path: 'service', select: 'name' } }).sort({ createdAt: -1 }).limit(200).lean(),
      Order.find({ paymentStatus: { $ne: 'paid' }, status: { $nin: ['cancelled','refunded'] } }).select('orderNumber customer delivery total paymentMethod paymentStatus fulfilment createdAt').populate('customer', 'name email phone').sort({ createdAt: -1 }).limit(100).lean(),
      Appointment.find({ paymentStatus: { $ne: 'paid' }, status: { $nin: ['cancelled'] } }).select('reference customerName service price paymentStatus startsAt').populate('service', 'name').sort({ startsAt: -1 }).limit(100).lean(),
      Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$total' } } }]),
      Order.countDocuments({ paymentStatus: { $ne: 'paid' }, status: { $nin: ['cancelled','refunded'] } })
    ]);
    res.json({ summary: { paidOrders: paidOrders[0]?.count || 0, paidTotal: paidOrders[0]?.total || 0, awaitingOrders, onlineAttempts: attempts.length }, attempts, pendingOrders, pendingAppointments });
  } catch (e) { next(e); }
});
api.post('/admin/orders/:id/email',async(req,res,next)=>{try{if(!objectId(req.params.id))return res.status(400).json({error:'Invalid order.'});const status=await sendOrderEmail(req.params.id);if(!status)return res.status(404).json({error:'Order not found.'});res.json({status})}catch(e){next(e)}});
api.patch('/admin/orders/:id/payment', async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) return res.status(400).json({ error: 'Invalid order.' });
    const { paymentStatus } = z.object({ paymentStatus: z.enum(['paid', 'pending']) }).parse(req.body);
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    order.paymentStatus = paymentStatus;
    if (paymentStatus === 'paid') order.status = 'paid';
    else if (order.status === 'paid') order.status = 'pending';
    await order.save();
    res.json(order);
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: e.issues[0].message }); next(e); }
});
api.delete('/admin/orders/:id', async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) return res.status(400).json({ error: 'Invalid order.' });
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ message: 'Order deleted.' });
  } catch (e) { next(e); }
});
api.patch('/admin/orders/:id', async (req, res, next) => { try { const status = z.enum(['processing', 'shipped', 'delivered', 'cancelled', 'refunded']).parse(req.body.status); const item = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }); if (!item) return res.status(404).json({ error: 'Order not found.' }); res.json(item); } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: e.issues[0].message }); next(e); } });
api.get('/admin/appointments', async (req, res, next) => { try { res.json(await Appointment.find().populate('service', 'name price').populate('salonist', 'name').populate('customer', 'name email phone').sort({ startsAt: -1 }).limit(200).lean()); } catch (e) { next(e); } });
api.post('/admin/appointments/:id/email',async(req,res,next)=>{try{if(!objectId(req.params.id))return res.status(400).json({error:'Invalid appointment.'});const status=await sendAppointmentEmail(req.params.id);if(!status)return res.status(404).json({error:'Appointment not found.'});res.json({status})}catch(e){next(e)}});
api.post('/admin/setup', async (req, res, next) => {
  try {
    if (!process.env.ADMIN_SETUP_KEY || req.get('x-admin-setup-key') !== process.env.ADMIN_SETUP_KEY) return res.status(403).json({ error: 'Invalid setup key.' });
    if (await User.exists({ role: 'admin' })) return res.status(409).json({ error: 'An administrator is already configured.' });
    const input = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8).max(128), phone: z.string().optional() }).parse(req.body);
    const user = await User.create({ ...input, email: input.email.toLowerCase(), role: 'admin', passwordHash: await bcrypt.hash(input.password, 12) }); res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: e.issues[0].message }); next(e); }
});
module.exports = { router: api, auth };

