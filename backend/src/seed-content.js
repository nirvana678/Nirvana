require('dotenv').config();
const mongoose=require('mongoose');
const {Product,Category,SalonService,Salonist}=require('./models');
const {Section,StoreSettings}=require('./models/content');
const assets=require('./demo-assets.json');
async function seedContent(){
 await mongoose.connect(process.env.MONGODB_URI);
 const demoProducts=[
 ['velvet-glow-serum',assets.serum,2490],['soft-matte-lip-tint',assets.lipstick,1400],['hydra-bloom-moisturizer',assets.cream,2990],['silk-press-heat-shield',assets.haircare,1900],['rose-oud-eau-de-parfum',assets.perfume,5600],['cloud-nine-curl-cream',assets.haircare,2100],['satin-finish-foundation',assets.powder,2600],['botanical-body-polish',assets.body,1700]
 ];
 for(const [slug,image,compareAt] of demoProducts){await Product.updateOne({slug,$or:[{image:/^https:\/\/images.unsplash.com/},{image:{$exists:false}},{image:''}]},{$set:{image,compareAt}})}
 const categories=['Makeup','Skincare','Haircare','Fragrance','Body Care','Nails',"Men’s Grooming",'Spa & Wellness','Beauty Tools','Wigs & Extensions'];
 for(let sortOrder=0;sortOrder<categories.length;sortOrder++){const name=categories[sortOrder];await Category.updateOne({name},{$setOnInsert:{name,slug:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),active:true,sortOrder}},{upsert:true});await Category.updateOne({name,sortOrder:{$exists:false}},{$set:{sortOrder}})}
 const serviceImages={'Signature knotless braids':assets.braids,'Silk press & treatment':assets.haircare,'Soft glam makeup':assets.artist2,'Restorative facial':assets.facial,'Classic manicure':assets.manicure,'Wig install & styling':assets.artist1};
 for(const [name,image] of Object.entries(serviceImages))await SalonService.updateOne({name,$or:[{image:{$exists:false}},{image:''}]},{$set:{image}});
 const people=[['Amara Wanjiku',assets.artist1],['Zuri Kamau',assets.artist2],['Nia Achieng',assets.artist3]];
 for(const [name,image] of people)await Salonist.updateOne({name,$or:[{image:{$exists:false}},{image:''}]},{$set:{image}});
 await StoreSettings.updateOne({key:'store'},{$setOnInsert:{key:'store',businessName:'Nirvana',tagline:'BEAUTY SHOP & SALON',logo:'',announcement:'Beauty offers: discover special prices on your favourite essentials.',deliveryMessage:'Free delivery on orders over KSh 5,000',phone:'',email:'',address:'Moi University, Eldoret, Uasin Gishu, Kenya',openingHours:'Monday – Saturday · 9:00 AM – 6:00 PM',footerText:'Shop your beauty essentials. Find your perfect salon moment. Everything you love, all in one place.',salonTitle:'Relax. Refresh. Rejuvenate.',salonDescription:'From a fresh hairstyle to a little self-care, discover salon experiences made for you.',salonImage:assets.salon,instagram:'',facebook:'',tiktok:'',accentColor:'#f50081',shopHeading:'The beauty shop',cartHeading:'Your shopping cart',checkoutHeading:'Checkout',bookingHeading:'Make your next beauty appointment.',pickupInstructions:'Collect at Nirvana Beauty Shop & Salon, Moi University, Eldoret.',whatsappNumber:'',freeDeliveryAt:5000,deliveryFee:250}},{upsert:true});
 await StoreSettings.updateOne({key:'store',address:'Nairobi, Kenya'},{$set:{address:'Moi University, Eldoret, Uasin Gishu, Kenya'}});
 for(const [field,value] of Object.entries({accentColor:'#ef0080',darkPink:'#b90062',softPink:'#ffe6f2',pagePink:'#fff5fa',inkColor:'#211c34',shopHeading:'The beauty shop',cartHeading:'Your shopping cart',checkoutHeading:'Checkout',bookingHeading:'Make your next beauty appointment.',pickupInstructions:'Collect at Nirvana Beauty Shop & Salon, Moi University, Eldoret.',whatsappNumber:'',tiktok:''}))await StoreSettings.updateOne({key:'store',[field]:{$exists:false}},{$set:{[field]:value}});
 for(const [slug,serviceName,colours] of [['soft-matte-lip-tint','Soft glam makeup',['Rose','Berry','Coral']],['botanical-body-polish','Classic manicure',['Classic Red','Blush Pink','Nude']]]){const service=await SalonService.findOne({name:serviceName}).select('_id');if(service)await Product.updateOne({slug,tags:{$ne:'demo-salon-v1'}},{$set:{salonUsable:true,salonService:service._id,colours},$addToSet:{tags:'demo-salon-v1'}})}
 const benefits=[['Beauty essentials','Discover your new favourites'],['Professional salonists','Meet your beauty team'],['Easy online booking','Find a time that suits you'],['Shop with confidence','Pay on delivery']];
 for(let index=0;index<benefits.length;index++) for(const [suffix,value] of [['Title',benefits[index][0]],['Text',benefits[index][1]]]){const field='benefit'+(index+1)+suffix;await StoreSettings.updateOne({key:'store',[field]:{$exists:false}},{$set:{[field]:value}})}
 const sections=[
 {name:'Main beauty campaign',kind:'hero',accent:'Beauty & Care',title:'All in One Place',subtitle:'Shop premium cosmetics and book professional salon services — all in one place.',image:'/images/beauty-campaign.png',buttonLabel:'Shop Now',buttonLink:'/shop',secondaryLabel:'Book an Appointment',secondaryLink:'/booking'},
 {name:'Shop categories',kind:'categories',title:'Explore beauty'},
 {name:'Featured beauty offers',kind:'products',title:'Beauty Offers',subtitle:'Your favourites, with a little extra to love.',buttonLabel:'View all',buttonLink:'/shop',saleOnly:true,limit:5},
 {name:'Salon invitation',kind:'salon',accent:'A LITTLE TIME FOR YOU',title:'Salon & Spa',subtitle:'Relax. Refresh. Rejuvenate. Discover your next beauty moment with our salon team.',image:assets.salon,buttonLabel:'Book an Appointment',buttonLink:'/booking'},
 {name:'Meet the salon team',kind:'artists',title:'Featured Salonists',buttonLabel:'View all',buttonLink:'/salon',limit:3},
 {name:'Salon service menu',kind:'services',accent:'BEAUTY BEGINS WITH YOU',title:'A little care, a beautiful difference.',subtitle:'Your next look. Your favourite treatment. Your moment.',buttonLabel:'All services',buttonLink:'/salon',limit:3},
 {name:'Shopping benefits',kind:'trust',title:'Beauty, thoughtfully selected',subtitle:'Essentials for your everyday routine'},
 {name:'Our brands',kind:'brands',title:'Discover Our Brands'}
 ];
 for(let sortOrder=0;sortOrder<sections.length;sortOrder++)await Section.updateOne({name:sections[sortOrder].name},{$setOnInsert:{...sections[sortOrder],sortOrder,enabled:true}},{upsert:true});
 console.log('Sample photos and editable storefront sections are ready. Existing admin edits are preserved.');await mongoose.disconnect();
}
seedContent().catch(async e=>{console.error(e);await mongoose.disconnect();process.exit(1)});
