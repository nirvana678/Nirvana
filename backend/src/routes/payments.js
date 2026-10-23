const express = require('express');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const { Order, Appointment, Payment, User } = require('../models');
const { authenticate, allow } = require('../middleware');

const router = express.Router();
const validId = value => /^[a-f\d]{24}$/i.test(String(value));
const configured = () => Boolean(process.env.PAYHERO_API_USERNAME && process.env.PAYHERO_API_PASSWORD && Number.isInteger(Number(process.env.PAYHERO_CHANNEL_ID)) && Number(process.env.PAYHERO_CHANNEL_ID) > 0);
const authHeader = () => `Basic ${Buffer.from(`${process.env.PAYHERO_API_USERNAME}:${process.env.PAYHERO_API_PASSWORD}`).toString('base64')}`;
const providerBase = 'https://backend.payhero.co.ke/api/v2';

function mobileNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const number = digits.startsWith('254') ? digits : digits.startsWith('0') ? `254${digits.slice(1)}` : `254${digits}`;
  if (!/^254[17]\d{8}$/.test(number)) throw Object.assign(new Error('Enter a valid Kenyan mobile money number.'), { status: 400 });
  return number;
}

async function providerRequest(path, options = {}) {
  const response = await fetch(`${providerBase}${path}`, {
    ...options,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error('Online payment is temporarily unavailable. Please try again.'), { status: 502 });
  return data;
}

async function settle(payment, data) {
  const result = data?.response || data?.data || data;
  const rawStatus = String(result?.Status || result?.status || result?.payment_status || '').toLowerCase();
  const amount = result?.Amount ?? result?.amount;
  const external = result?.ExternalReference || result?.external_reference;
  const providerRef = result?.reference || result?.Reference;
  if (external && external !== payment.reference) return payment;
  if (providerRef && payment.providerReference && providerRef !== payment.providerReference && !external) return payment;
  if (amount !== undefined && Number(amount) !== payment.amount) return payment;
  const success = ['success', 'successful', 'completed', 'paid'].includes(rawStatus) || (result?.ResultCode === 0 && rawStatus === 'success');
  const code = Number(result?.ResultCode ?? result?.result_code);
  const failure = ['failed', 'failure', 'cancelled', 'canceled', 'rejected', 'timeout', 'timed out', 'expired'].includes(rawStatus) || (Number.isFinite(code) && code !== 0);
  const failureMessage = customerFailureMessage(result);
  if (success && payment.status !== 'success') {
    await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'success', verifiedAt: new Date(), checkedAt: new Date() } });
    if (payment.order) await Order.updateOne({ _id: payment.order, paymentStatus: { $ne: 'paid' } }, { $set: { paymentStatus: 'paid', status: 'paid' } });
    if (payment.appointment) await Appointment.updateOne({ _id: payment.appointment, paymentStatus: { $ne: 'paid' } }, { $set: { paymentStatus: 'paid' } });
  } else if (failure && payment.status === 'pending') {
    await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed', failureMessage, checkedAt: new Date() } });
  } else {
    await Payment.updateOne({ _id: payment._id }, { $set: { checkedAt: new Date() } });
  }
  return Payment.findById(payment._id);
}

function customerFailureMessage(result = {}) {
  const code = Number(result?.ResultCode ?? result?.result_code);
  const description = String(result?.ResultDesc || result?.result_description || '').toLowerCase();
  if (code === 1032 || /cancelled by user|request cancelled by user|user cancelled/.test(description)) return 'You cancelled the M-Pesa prompt. You can try again when you are ready.';
  if (code === 1 || /insufficient funds/.test(description)) return 'The M-Pesa account does not have enough funds for this payment. Top up and try again.';
  if (code === 2001 || /wrong pin|incorrect pin|invalid pin/.test(description)) return 'The M-Pesa PIN was not accepted. Please check it and try again.';
  if (/timed? ?out|timeout|expired|no response/.test(description)) return 'The M-Pesa prompt expired before it was completed. You can try again.';
  return 'The M-Pesa payment was not completed. Please try again.';
}

async function reconcile(payment) {
  if (!configured() || payment.status !== 'pending' || !payment.providerReference) return payment;
  if (payment.checkedAt && Date.now() - payment.checkedAt.getTime() < 5000) return payment;
  const data = await providerRequest(`/transaction-status?reference=${encodeURIComponent(payment.providerReference)}`);
  return settle(payment, data);
}

router.get('/config', (req, res) => res.json({ onlineAvailable: configured() }));

// Callback bodies only trigger a server-to-server status check. They never mark an order paid directly.
router.post('/callback', async (req, res, next) => {
  try {
    const result = req.body?.response || req.body?.data || req.body;
    const reference = result?.ExternalReference || result?.external_reference;
    if (!reference || typeof reference !== 'string' || reference.length > 100) return res.sendStatus(200);
    const payment = await Payment.findOne({ reference });
    const checkoutId = result?.CheckoutRequestID || result?.checkout_request_id;
    if (payment && Number(result?.Amount ?? result?.amount) === payment.amount && (!payment.checkoutRequestId || !checkoutId || checkoutId === payment.checkoutRequestId)) {
      const code = Number(result?.ResultCode ?? result?.result_code);
      const status = String(result?.Status || result?.status || '').toLowerCase();
      const failed = ['failed', 'failure', 'cancelled', 'canceled', 'rejected', 'timeout', 'timed out', 'expired'].includes(status) || (Number.isFinite(code) && code !== 0);
      if (failed && payment.status === 'pending') {
        await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed', failureMessage: customerFailureMessage(result), checkedAt: new Date() } });
      } else if (['success', 'successful', 'completed', 'paid'].includes(status) || (code === 0 && status === 'success')) {
        // Match the provider callback to our unguessable reference, expected amount, and checkout ID.
        await settle(payment, req.body);
      }
    }
    res.sendStatus(200);
  } catch (error) { next(error); }
});

router.use(authenticate, allow('customer'), async (req, res, next) => {
  try {
    if (!await User.exists({ _id: req.auth.sub, role: 'customer', status: 'active' })) return res.status(403).json({ error: 'This account cannot make a payment.' });
    next();
  } catch (error) { next(error); }
});

router.post('/start', async (req, res, next) => {
  try {
    if (!configured()) return res.status(503).json({ error: 'Online payments are being set up. Please choose pay on delivery or try later.' });
    const input = z.object({ orderId: z.string().refine(validId).optional(), appointmentId: z.string().refine(validId).optional(), phone: z.string().min(9).max(25) }).refine(value => Boolean(value.orderId) !== Boolean(value.appointmentId), 'Choose one order or appointment.').parse(req.body);
    const target = input.orderId
      ? await Order.findOne({ _id: input.orderId, customer: req.auth.sub })
      : await Appointment.findOne({ _id: input.appointmentId, customer: req.auth.sub });
    if (!target) return res.status(404).json({ error: 'Payment item not found.' });
    if (target.paymentStatus === 'paid') return res.status(409).json({ error: 'This has already been paid.' });
    if (['cancelled', 'refunded'].includes(target.status)) return res.status(409).json({ error: 'This item cannot be paid online.' });
    const amount = input.orderId ? target.total : target.price;
    if (!Number.isSafeInteger(amount) || amount < 1) return res.status(400).json({ error: 'This amount cannot be paid online.' });
    const pending = await Payment.findOne({ ...(input.orderId ? { order: target._id } : { appointment: target._id }), status: 'pending', createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) } }).sort({ createdAt: -1 });
    if (pending) return res.status(409).json({ error: 'A payment prompt is already in progress. Please check your phone or refresh its status.' });
    const phone = mobileNumber(input.phone);
    const payment = await Payment.create({ reference: `NIRPAY-${randomUUID()}`, ...(input.orderId ? { order: target._id } : { appointment: target._id }), amount, phone, provider: 'payhero' });
    try {
      const publicBase = process.env.PUBLIC_API_URL?.replace(/\/$/, '');
      const callback = publicBase && /^https:\/\//i.test(publicBase) ? `${publicBase}/api/payments/callback` : undefined;
      const data = await providerRequest('/payments', { method: 'POST', body: JSON.stringify({ amount, phone_number: phone, channel_id: Number(process.env.PAYHERO_CHANNEL_ID), provider: 'm-pesa', external_reference: payment.reference, customer_name: input.orderId ? target.delivery?.name : target.customerName, ...(callback ? { callback_url: callback } : {}) }) });
      if (!data?.success || !data?.reference) throw Object.assign(new Error('The payment prompt could not be started. Please try again.'), { status: 502 });
      await Payment.updateOne({ _id: payment._id }, { $set: { providerReference: data.reference, checkoutRequestId: data.CheckoutRequestID || '' } });
      res.status(201).json({ id: payment.id, status: payment.status, message: 'A payment prompt has been sent to your phone. Enter your mobile money PIN there.' });
    } catch (error) {
      if (error.name !== 'TimeoutError' && error.name !== 'AbortError') {
        payment.status = 'failed'; await payment.save();
      }
      throw error;
    }
  } catch (error) { next(error); }
});

router.get('/:id/status', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid payment.' });
    let payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    const target = payment.order ? await Order.findOne({ _id: payment.order, customer: req.auth.sub }) : await Appointment.findOne({ _id: payment.appointment, customer: req.auth.sub });
    if (!target) return res.status(404).json({ error: 'Payment not found.' });
    try { payment = await reconcile(payment); } catch (error) { console.error('Payment status lookup:', error.message); }
    res.json({ id: payment.id, status: payment.status, amount: payment.amount, message: payment.status === 'failed' ? (payment.failureMessage || 'The M-Pesa payment was not completed. Please try again.') : undefined, verifiedAt: payment.verifiedAt || null });
  } catch (error) { next(error); }
});

module.exports = { router, configured };
