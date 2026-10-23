require('dotenv').config();
const mongoose=require('mongoose');const {Product,Brand}=require('./models');const assets=require('./demo-assets.json');
const updates=[
 ['satin-finish-foundation','Satin Finish Foundation','Silky Finish Setting Powder','Nia Beauty','Makeup',assets.powder,'A lightweight setting powder for a smooth, soft matte finish.'],
 ['soft-matte-lip-tint','Soft Matte Lip Tint','Soft Matte Lip Tint','Nia Beauty','Makeup',assets.lipstick,'A richly pigmented red lip colour with a comfortable matte finish.'],
 ['hydra-bloom-moisturizer','Hydra Bloom Moisturizer','Lash Definition Mascara','Essence','Makeup',assets.mascara,'Add definition and volume to your lashes with a deep black finish.'],
 ['rose-oud-eau-de-parfum','Rose Oud Eau de Parfum','J’adore Eau de Parfum','Dior','Fragrance',assets.perfume,'A luminous floral fragrance for your everyday collection.'],
 ['cloud-nine-curl-cream','Cloud Nine Curl Cream','Everyday Eyeshadow Palette','Nia Beauty','Makeup',assets.eyeshadow,'A versatile palette of blendable shades for soft daytime looks and evening definition.'],
 ['botanical-body-polish','Botanical Body Polish','Rose Petal Nail Colour','Nia Beauty','Nails',assets.nails,'A rich red nail colour with a glossy finish.'],
 ['velvet-glow-serum','Velvet Glow Serum','Velvet Glow Serum','Glow Lab','Skincare',assets.serum,'A lightweight brightening serum for a dewy, even-looking glow.'],
 ['silk-press-heat-shield','Silk Press Heat Shield','Hydrating Body Lotion','Vaseline','Body Care',assets.body,'Daily body and face moisture for a soft, comfortable skin feel.']
];
(async()=>{await mongoose.connect(process.env.MONGODB_URI);for(let sortOrder=0;sortOrder<updates.length;sortOrder++){const [slug,oldName,name,brand,category,image,description]=updates[sortOrder];await Product.updateOne({slug,name:{$in:[oldName,name]},tags:{$ne:'demo-photos-v2'}},{$set:{name,brand,category,image,description,sortOrder},$addToSet:{tags:'demo-photos-v2'}})}for(const name of ['Essence','Dior','Vaseline'])await Brand.updateOne({name},{$setOnInsert:{name}},{upsert:true});console.log('Demo items now have distinct, matching product photos.');await mongoose.disconnect()})().catch(e=>{console.error(e);process.exit(1)});
