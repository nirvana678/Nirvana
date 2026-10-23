const { Schema, model } = require('mongoose');

const sectionSchema = new Schema({
  name: { type: String, required: true },
  kind: { type: String, enum: ['hero', 'categories', 'products', 'salon', 'artists', 'services', 'brands', 'trust'], required: true },
  title: String, subtitle: String, accent: String, image: String,
  buttonLabel: String, buttonLink: String, secondaryLabel: String, secondaryLink: String,
  category: String, saleOnly: { type: Boolean, default: false }, featuredProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  limit: { type: Number, default: 5 }, sortOrder: { type: Number, default: 0 },
  enabled: { type: Boolean, default: true }
}, { timestamps: true });

const galleryWorkSchema = new Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, default: 'Salon work' },
  description: String,
  artistName: String,
  image: { type: String, required: true },
  sortOrder: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  published: { type: Boolean, default: true }
}, { timestamps: true });

const settingsSchema = new Schema({
  key: { type: String, default: 'store', unique: true },
  businessName: { type: String, default: 'Nirvana' }, tagline: String, logo: String,
  announcement: String, deliveryMessage: String, phone: String, email: String,
  address: String, openingHours: String, footerText: String,
  accentColor: { type: String, default: '#ef0080' }, darkPink: { type: String, default: '#b90062' }, softPink: { type: String, default: '#ffe6f2' }, pagePink: { type: String, default: '#fff5fa' }, inkColor: { type: String, default: '#211c34' }, shopHeading: String, cartHeading: String, checkoutHeading: String, bookingHeading: String, chatHeading: String, chatDescription: String, staffChatHeading: String, paymentHeading: String, assistantHeading: String, assistantDescription: String,
  pickupInstructions: String, whatsappNumber: String,
  salonTitle: String, salonDescription: String, salonImage: String,
  instagram: String, facebook: String, tiktok: String,
  freeDeliveryAt: { type: Number, default: 5000 }, deliveryFee: { type: Number, default: 250 }
}, { timestamps: true });

for (let index=1;index<=4;index++) settingsSchema.add({[`benefit${index}Title`]:String,[`benefit${index}Text`]:String});
module.exports = { Section: model('Section', sectionSchema), GalleryWork: model('GalleryWork', galleryWorkSchema), StoreSettings: model('StoreSettings', settingsSchema) };
