require('dotenv').config();
const mongoose = require('mongoose');
const { Product, Category, Brand, SalonService, Salonist, FlashSale } = require('./models');
const products = [
  ['Velvet Glow Serum', 'Glow Lab', 'Skincare', 1850, 32, 'A lightweight brightening serum for a dewy, even-looking glow.', 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85'],
  ['Soft Matte Lip Tint', 'Nia Beauty', 'Makeup', 980, 45, 'A comfortable, buildable lip tint with a soft-focus finish.', 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=900&q=85'],
  ['Hydra Bloom Moisturizer', 'Skin Ritual', 'Skincare', 2200, 18, 'Daily hydration with a feather-light, non-greasy feel.', 'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85'],
  ['Silk Press Heat Shield', 'Crown Care', 'Haircare', 1450, 24, 'A protective styling mist for smooth, shiny finishes.', 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=900&q=85'],
  ['Rose Oud Eau de Parfum', 'Nirvana Edit', 'Fragrance', 4200, 11, 'Warm rose, soft amber and a quietly addictive oud base.', 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=900&q=85'],
  ['Cloud Nine Curl Cream', 'Crown Care', 'Haircare', 1650, 29, 'Defines natural curls with soft hold and lasting moisture.', 'https://images.unsplash.com/photo-1600612253971-422e7f7faeb6?auto=format&fit=crop&w=900&q=85'],
  ['Satin Finish Foundation', 'Nia Beauty', 'Makeup', 1950, 20, 'A skin-like medium coverage base with a radiant satin finish.', 'https://images.unsplash.com/photo-1631214540242-7d6f9e7f6c8d?auto=format&fit=crop&w=900&q=85'],
  ['Botanical Body Polish', 'Skin Ritual', 'Body Care', 1250, 36, 'A gentle sugar polish with nourishing botanical oils.', 'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=900&q=85']
];
async function run() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env');
  await mongoose.connect(process.env.MONGODB_URI);
  for (const [name, brand, category, price, stock, description, image] of products) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await Product.updateOne({ slug }, { $setOnInsert: { name, brand, category, price, stock, description, image, slug, sku: `NV-${slug.toUpperCase().slice(0, 12)}`, featured: true, published: true } }, { upsert: true });
  }
  for (const name of ['Makeup', 'Skincare', 'Haircare', 'Wigs & Extensions', 'Fragrance', 'Body Care', 'Nails', 'Beauty Tools']) await Category.updateOne({ name }, { $setOnInsert: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), active: true } }, { upsert: true });
  for (const name of ['Glow Lab', 'Nia Beauty', 'Skin Ritual', 'Crown Care', 'Nirvana Edit']) await Brand.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  const serviceRows = [['Signature knotless braids', 'Braiding', 240, 4500], ['Silk press & treatment', 'Hair care', 120, 3800], ['Soft glam makeup', 'Makeup', 90, 3500], ['Restorative facial', 'Spa', 75, 4200], ['Classic manicure', 'Nails', 60, 1800], ['Wig install & styling', 'Wig services', 120, 5000]];
  const services = [];
  for (const [name, category, durationMinutes, price] of serviceRows) { let service = await SalonService.findOne({ name }); if (!service) service = await SalonService.create({ name, category, durationMinutes, price, active: true, description: 'A tailored Nirvana salon experience with a little extra care.' }); services.push(service); }
  if (!await Salonist.exists()) await Salonist.create([{ name: 'Amara Wanjiku', bio: 'Protective style specialist with a gentle touch and an eye for detail.', specialties: ['Braids', 'Natural hair'], services: [services[0]._id, services[1]._id] }, { name: 'Zuri Kamau', bio: 'Makeup artist and skin therapist focused on fresh, confident beauty.', specialties: ['Makeup', 'Facials'], services: [services[2]._id, services[3]._id] }, { name: 'Nia Achieng', bio: 'Nail artist and wig stylist who makes every finish feel personal.', specialties: ['Nails', 'Wig styling'], services: [services[4]._id, services[5]._id] }]);
  if (!await FlashSale.exists()) await FlashSale.create({ name: 'Beauty Finds, Better Prices', startsAt: new Date(), endsAt: new Date(Date.now() + 7 * 86400000), active: true, items: [] });
  console.log('Development catalog seeded. Products and services are demonstration content.'); await mongoose.disconnect();
}
run().catch(async error => { console.error(error); await mongoose.disconnect(); process.exit(1); });
