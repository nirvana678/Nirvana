const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { Product, Category, Brand, SalonService, Salonist, User, Appointment } = require('../models');
const { Section, GalleryWork, StoreSettings } = require('../models/content');
const defaultStoreSettings = require('../store-settings-defaults');
const router = express.Router();
const id = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const text = z.string().trim().max(4000);
const name = z.string().trim().min(2).max(140);
const image = z.string().max(2000).refine(v => !v || /^https?:\/\//i.test(v) || /^\/(images|uploads)\/[a-zA-Z0-9._/-]+$/.test(v), 'Use an image URL or upload a photo.');
const link = z.string().max(200).refine(v => !v || /^\/(?!\/)/.test(v), 'Use a site path such as /shop or /salon.');
const price = z.number().int().min(0).max(10000000);
const productOption = z.object({ _id:id.optional(), label:name, volume:text.default(''), color:text.default(''), details:text.default(''), image:image.default(''), sku:text.default(''), price:price.optional(), compareAt:price.default(0), stock:z.number().int().min(0).max(1000000).default(0) });
const resourceSchemas = {
  products: z.object({ name, slug: z.string().regex(/^[a-z0-9-]+$/), sku: name, brand: text.default(''), category: name, description: text.default(''), image: image.default(''), colours: z.array(z.string().max(80)).default([]), variants: z.array(z.string().max(80)).default([]), options:z.array(productOption).max(100).default([]), salonUsable: z.boolean().default(false), salonService: z.union([id,z.literal(''),z.null()]).default(null).transform(v=>v||null), price, compareAt: price.default(0), stock: z.number().int().min(0).max(1000000), sortOrder:z.number().int().min(0).default(0), published: z.boolean().default(true), featured: z.boolean().default(false) }),
  categories: z.object({ name, slug: z.string().regex(/^[a-z0-9-]+$/), image: image.default(''), active: z.boolean().default(true), sortOrder: z.number().int().min(0).default(0) }),
  brands: z.object({ name, logo: image.default('') }),
  services: z.object({ name, category: text.default(''), description: text.default(''), image: image.default(''), durationMinutes: z.number().int().min(15).max(720), price, active: z.boolean().default(true) }),
  salonists: z.object({ name, bio: text.default(''), image: image.default(''), phone: text.default(''), email: z.union([z.string().email(),z.literal('')]).default(''), specialties: z.array(z.string().max(80)).max(20).default([]), services: z.array(id).max(100).default([]), workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24), active: z.boolean().default(true) }),
  sections: z.object({ name, kind: z.enum(['hero','categories','products','salon','artists','services','brands','trust']), title: text.default(''), subtitle: text.default(''), accent: text.default(''), image: image.default(''), buttonLabel: text.default(''), buttonLink: link.default(''), secondaryLabel: text.default(''), secondaryLink: link.default(''), category: text.default(''), saleOnly: z.boolean().default(false), featuredProducts: z.array(id).max(24).default([]), limit: z.number().int().min(1).max(24).default(5), sortOrder: z.number().int().min(0).default(0), enabled: z.boolean().default(true) }),
  gallery: z.object({ title: name, category: text.default('Salon work'), description: text.default(''), artistName: text.default(''), image: image.refine(Boolean, 'Upload a gallery photo.'), sortOrder: z.number().int().min(0).default(0), featured: z.boolean().default(false), published: z.boolean().default(true) })
};
const models = { products: Product, categories: Category, brands: Brand, services: SalonService, salonists: Salonist, sections: Section, gallery: GalleryWork };
const settingsSchema = z.object({ businessName: name, tagline: text, logo: image, announcement: text, deliveryMessage: text, phone: text, email: z.union([z.string().email(), z.literal('')]), address: text, openingHours: text, footerText: text, salonTitle: text, salonDescription: text, salonImage: image, instagram: z.union([z.string().url().startsWith('https://'),z.literal('')]), facebook: z.union([z.string().url().startsWith('https://'),z.literal('')]), tiktok: z.union([z.string().url().startsWith('https://'),z.literal('')]), freeDeliveryAt: price, deliveryFee: price });
const hexColor=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const siteSchema = settingsSchema.extend({accentColor:hexColor,darkPink:hexColor,softPink:hexColor,pagePink:hexColor,inkColor:hexColor,shopHeading:text,cartHeading:text,checkoutHeading:text,bookingHeading:text,chatHeading:text.default(''),chatDescription:text.default(''),staffChatHeading:text.default(''),paymentHeading:text.default(''),assistantHeading:text.default(''),assistantDescription:text.default(''),pickupInstructions:text,whatsappNumber:text,...Object.fromEntries([1,2,3,4].flatMap(i=>[['benefit'+i+'Title',text.default('')],['benefit'+i+'Text',text.default('')]]))});
const attempt = fn => async (req,res,next) => { try { await fn(req,res); } catch(e) { next(e); } };

async function validateRelations(kind, input) {
  if (kind === 'sections' && input.featuredProducts?.length && await Product.countDocuments({ _id: { $in: input.featuredProducts }, published: true }) !== new Set(input.featuredProducts).size) throw Object.assign(new Error('Choose products that are published in the shop.'), { status: 400 });
  if (kind === 'salonists') {
    if (input.startHour !== undefined && input.endHour !== undefined && input.startHour >= input.endHour) throw Object.assign(new Error('Closing hour must be after opening hour.'), { status: 400 });
    if (input.services && await SalonService.countDocuments({ _id: { $in: input.services } }) !== new Set(input.services).size) throw Object.assign(new Error('Select existing salon services.'), { status: 400 });
  }
}

for (const [kind, Model] of Object.entries(models)) {
  router.get(`/${kind}`, attempt(async (req,res) => res.json(await Model.find().sort(['sections','categories','gallery'].includes(kind) ? { sortOrder: 1, createdAt: 1 } : { createdAt: -1 }).lean())));
  router.post(`/${kind}`, attempt(async (req,res) => {
    const input = resourceSchemas[kind].parse(req.body); await validateRelations(kind, input);
    res.status(201).json(await Model.create(input));
  }));
  router.patch(`/${kind}/:id`, attempt(async (req,res) => {
    const recordId = id.parse(req.params.id); const current = await Model.findById(recordId);
    if (!current) return res.status(404).json({ error: 'Record not found.' });
    const input = resourceSchemas[kind].parse({ ...JSON.parse(JSON.stringify(current.toObject())), ...req.body });
    await validateRelations(kind, input);
    Object.assign(current, input); await current.save(); res.json(current);
  }));
  router.delete(`/${kind}/:id`, attempt(async (req,res) => {
    const recordId = id.parse(req.params.id);
    const archivedField = { products: 'published', services: 'active', salonists: 'active', categories: 'active', sections: 'enabled', gallery: 'published' }[kind];
    const item = archivedField ? await Model.findByIdAndUpdate(recordId, { [archivedField]: false }, { new: true }) : await Model.findByIdAndDelete(recordId);
    if (!item) return res.status(404).json({ error: 'Record not found.' });
    res.json({ message: archivedField ? 'Archived. You can enable this record again in the editor.' : 'Removed.' });
  }));
}
router.get('/settings', attempt(async (req,res) => res.json(await StoreSettings.findOne({ key: 'store' }).lean() || {})));
router.put('/settings', attempt(async (req,res) => res.json(await StoreSettings.findOneAndUpdate({ key: 'store' }, siteSchema.parse(req.body), { upsert: true, new: true, runValidators: true }))));
router.post('/settings/reset', attempt(async (req,res) => res.json(await StoreSettings.findOneAndUpdate({ key: 'store' }, { $set: defaultStoreSettings }, { upsert: true, new: true, runValidators: true }))));
router.get('/customers', attempt(async (req,res) => res.json(await User.find({role:'customer'}).select('name email phone status createdAt').sort({createdAt:-1}).lean())));
router.patch('/customers/:id', attempt(async (req,res) => {
  const customer = await User.findOneAndUpdate({_id:id.parse(req.params.id),role:'customer'}, {status:z.enum(['active','suspended']).parse(req.body.status)}, {new:true});
  if (!customer) return res.status(404).json({error:'Customer not found.'}); res.json(customer);
}));
router.post('/salonists/:id/access', attempt(async (req,res) => {
  const salonist=await Salonist.findById(id.parse(req.params.id));
  if(!salonist) return res.status(404).json({error:'Salonist not found.'});
  if(!salonist.email) return res.status(400).json({error:'Add the salonist email first.'});
  const email=salonist.email.toLowerCase();
  const existing=await User.findOne({email});
  if(existing && (existing.role!=='salonist'||(salonist.user&&String(salonist.user)!==String(existing._id))||await Salonist.exists({_id:{$ne:salonist._id},user:existing._id}))) return res.status(409).json({error:'That email belongs to another account.'});
  const password=crypto.randomBytes(16).toString('base64url');
  const user=existing||new User({email,role:'salonist'});
  user.name=salonist.name;user.phone=salonist.phone;user.status='active';user.passwordHash=await bcrypt.hash(password,12);
  await user.save();salonist.user=user._id;await salonist.save();
  res.json({email,password,message:'Share this one-time password privately. It will only appear once; ask the salonist to change it after signing in.'});
}));
router.post('/media', express.json({ limit: '8mb' }), attempt(async (req,res) => {
  const { data } = z.object({ data: z.string().max(8 * 1024 * 1024) }).parse(req.body);
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match) return res.status(400).json({error:'Choose a JPG, PNG or WebP image.'});
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({error:'Images must be smaller than 5 MB.'});
  const valid = match[1] === 'jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : match[1] === 'png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
  if (!valid) return res.status(400).json({error:'The file does not match the selected image format.'});
  const filename = `${crypto.randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  const cloudinary = { cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET };
  const configured = Object.values(cloudinary).filter(Boolean).length;
  if (configured && configured !== 3) return res.status(503).json({error:'Image storage is not fully configured. Contact the site administrator.'});
  if (configured === 3) {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'nirvana';
    const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${cloudinary.apiSecret}`).digest('hex');
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: `image/${match[1]}` }), filename);
    form.append('api_key', cloudinary.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature', signature);
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || typeof result.secure_url !== 'string') {
        console.error('Cloudinary image upload failed:', result.error?.message || response.status);
        return res.status(502).json({error:'Image upload failed. Please try again.'});
      }
      return res.status(201).json({url:result.secure_url});
    } catch (error) {
      console.error('Cloudinary image upload failed:', error.message);
      return res.status(502).json({error:'Image storage could not be reached. Please try again.'});
    }
  }
  if (process.env.NODE_ENV === 'production') return res.status(503).json({error:'Persistent image storage is not configured.'});
  const directory = path.resolve(__dirname, '../../uploads'); await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,filename),buffer,{flag:'wx'});
  res.status(201).json({url:`/uploads/${filename}`});
}));

// Staff can create and reschedule appointments, with the same transactional clash check.
const appointmentInput = z.object({ customer: id, service: id, salonist: id, startsAt: z.string().datetime(), customerName: name, customerPhone: z.string().min(7).max(30), status: z.enum(['pending','confirmed','completed','cancelled']), paymentStatus: z.enum(['pending','paid','pay-at-salon']) });
async function saveAppointment(req,res) {
  const existing = req.params.id ? await Appointment.findById(id.parse(req.params.id)) : null;
  if (req.params.id && !existing) return res.status(404).json({error:'Appointment not found.'});
  const input = appointmentInput.parse(req.body);
  const session = await Appointment.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      const [customer, service, artist] = await Promise.all([User.findById(input.customer).session(session),SalonService.findOne({_id:input.service,active:true}).session(session),Salonist.findOne({_id:input.salonist,active:true,services:input.service}).session(session)]);
      if (!customer || !service || !artist) throw Object.assign(new Error('Choose an active service and a salonist who offers it.'),{status:400});
      const startsAt=new Date(input.startsAt), endsAt=new Date(startsAt.getTime()+service.durationMinutes*60000);
      if (['pending','confirmed'].includes(input.status)) {
        const minutes=startsAt.getHours()*60+startsAt.getMinutes(), endMinutes=minutes+service.durationMinutes;
        if (!artist.workDays.includes(startsAt.getDay()) || minutes < artist.startHour*60 || endMinutes > artist.endHour*60) throw Object.assign(new Error('Choose a time within the salonist’s working hours.'),{status:400});
        await Salonist.updateOne({_id:artist._id},{$inc:{scheduleVersion:1}},{session});
        const clash=await Appointment.exists({_id:{$ne:existing?._id},salonist:artist._id,status:{$in:['pending','confirmed']},startsAt:{$lt:endsAt},endsAt:{$gt:startsAt}}).session(session);
        if (clash) throw Object.assign(new Error('That salonist is already booked at this time.'),{status:409});
      }
      const values={...input,startsAt,endsAt,price:service.price};
      if(existing) result=await Appointment.findByIdAndUpdate(existing._id,values,{new:true,session,runValidators:true});
      else [result]=await Appointment.create([{...values,reference:`NS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`}],{session});
    });
    res.status(existing?200:201).json(result);
  } finally { await session.endSession(); }
}
router.post('/appointments',attempt(saveAppointment));
router.patch('/appointments/:id',attempt(saveAppointment));
module.exports={router,settingsSchema,resourceSchemas};
