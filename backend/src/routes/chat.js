const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { Conversation, ChatMessage, Salonist, Appointment, User } = require('../models');
const { authenticate, allow } = require('../middleware');

const router = express.Router();
const validId = value => /^[a-f\d]{24}$/i.test(String(value));
router.use(authenticate, allow('customer', 'salonist'));

async function scope(req) {
  const account = await User.findById(req.auth.sub).select('status role');
  if (!account || account.status !== 'active' || account.role !== req.auth.role) return null;
  if (req.auth.role === 'customer') return { customer: req.auth.sub };
  const artist = await Salonist.findOne({ user: req.auth.sub }).select('_id');
  return artist ? { salonist: artist._id } : null;
}

async function getConversation(req) {
  if (!validId(req.params.id)) return null;
  const filter = await scope(req);
  return filter && Conversation.findOne({ _id: req.params.id, ...filter })
    .populate('customer', 'name')
    .populate('salonist', 'name image specialties')
    .lean();
}

router.get('/', async (req, res, next) => {
  try {
    const filter = await scope(req);
    if (!filter) return res.status(404).json({ error: 'No salonist profile is linked to this account.' });
    const conversations = await Conversation.find(filter).sort({ lastMessageAt: -1, createdAt: -1 }).limit(100)
      .populate('customer', 'name').populate('salonist', 'name image specialties').lean();
    res.json(conversations);
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!await scope(req)) return res.status(403).json({ error: 'This account cannot use chat.' });
    const input = z.object({ salonistId: z.string().refine(validId).optional(), customerId: z.string().refine(validId).optional() }).parse(req.body);
    let artist, customerId;
    if (req.auth.role === 'customer') {
      if (!input.salonistId) return res.status(400).json({ error: 'Choose a salonist.' });
      artist = await Salonist.findOne({ _id: input.salonistId, active: true, user: { $ne: null } }).populate('user', 'status');
      if (!artist || artist.user?.status !== 'active') return res.status(409).json({ error: 'In-app chat is not available for this salonist yet.' });
      customerId = req.auth.sub;
    } else {
      if (!input.customerId) return res.status(400).json({ error: 'Choose a client.' });
      artist = await Salonist.findOne({ user: req.auth.sub, active: true });
      if (!artist || !await Appointment.exists({ salonist: artist._id, customer: input.customerId })) return res.status(403).json({ error: 'You can only start a chat with your booked clients.' });
      customerId = input.customerId;
    }
    const customer = await User.findById(customerId).select('status role');
    if (!customer || customer.status !== 'active' || customer.role !== 'customer') return res.status(403).json({ error: 'This account cannot start a conversation.' });
    const conversation = await Conversation.findOneAndUpdate({ customer: customerId, salonist: artist._id },
      { $setOnInsert: { customer: customerId, salonist: artist._id } }, { upsert: true, new: true });
    res.status(201).json({ _id: conversation._id });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const conversation = await getConversation(req);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    const [messages, appointments] = await Promise.all([
      ChatMessage.find({ conversation: conversation._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Appointment.find({ customer: conversation.customer._id, salonist: conversation.salonist._id })
        .select('reference startsAt price paymentStatus status service customerPhone')
        .populate('service', 'name').sort({ startsAt: -1 }).limit(30).lean()
    ]);
    const unreadField = req.auth.role === 'customer' ? 'customerUnread' : 'salonistUnread';
    await Conversation.updateOne({ _id: conversation._id }, { $set: { [unreadField]: 0 } });
    res.json({ conversation, messages: messages.reverse(), appointments });
  } catch (error) { next(error); }
});

router.post('/:id', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), async (req, res, next) => {
  try {
    const conversation = await getConversation(req);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    const message = await ChatMessage.create({ conversation: conversation._id, sender: req.auth.sub, body });
    const unreadField = req.auth.role === 'customer' ? 'salonistUnread' : 'customerUnread';
    await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessageAt: message.createdAt, lastMessageText: body.slice(0, 140) }, $inc: { [unreadField]: 1 } });
    res.status(201).json(message);
  } catch (error) { next(error); }
});

module.exports = { router };
