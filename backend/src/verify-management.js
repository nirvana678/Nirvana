// Integration checks use disposable records and remove only records created by this run.
require('dotenv').config();
const fs=require('fs/promises');const path=require('path');const assert=require('node:assert/strict');const mongoose=require('mongoose');
const models=require('./models');const {Section}=require('./models/content');
const base=process.env.VERIFY_BASE_URL||'http://127.0.0.1:4000/api';const created=[];let uploaded='';
async function request(method,route,body,token,expected=200){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();assert.equal(response.status,expected,`${method} ${route}: ${JSON.stringify(data)}`);return data}
async function main(){
 await mongoose.connect(process.env.MONGODB_URI);
 const file=await fs.readFile(path.resolve(__dirname,'../../ADMIN-ACCESS.local.txt'),'utf8');
 const email=/Email: (.+)/.exec(file)[1].trim(),password=/Password: (.+)/.exec(file)[1].trim();
 const login=await request('POST','/auth/login',{email,password});const token=login.token;
 await request('GET','/admin/products',undefined,undefined,401);
 const unique=Date.now().toString(36);const customer=await request('POST','/auth/register',{email:`verify-${unique}@example.test`,password:`Verify-${unique}-temporary`,phone:'0700000000'},undefined,201);created.push([models.User,customer.user.id]);
 await request('GET','/admin/sections',undefined,customer.token,403);
 for(const route of ['dashboard','products','categories','brands','services','salonists','sections','settings','customers','orders','appointments'])await request('GET',`/admin/${route}`,undefined,token);
 console.log('PASS: login, authorization and every dashboard list.');
 const add=async(kind,body,Model)=>{const row=await request('POST',`/admin/${kind}`,body,token,201);created.push([Model,row._id]);return row};
 const category=await add('categories',{name:`Verification ${unique}`,slug:`verify-${unique}`},models.Category);
 const brand=await add('brands',{name:`Verification ${unique}`,logo:''},models.Brand);
 const service=await add('services',{name:`Verification service ${unique}`,category:'Beauty',durationMinutes:60,price:500,image:'/images/facial.jpg'},models.SalonService);
 const artist=await add('salonists',{name:`Verification artist ${unique}`,services:[service._id],workDays:[0,1,2,3,4,5,6],startHour:7,endHour:22},models.Salonist);
 const product=await add('products',{name:`Verification product ${unique}`,slug:`verify-${unique}`,sku:`VERIFY-${unique}`,brand:brand.name,category:category.name,price:1000,compareAt:1500,stock:10,image:'/images/lipstick.webp'},models.Product);
 const section=await add('sections',{name:`Verification section ${unique}`,kind:'products',title:'Verification heading',limit:3,sortOrder:1000},Section);
 for(const [kind,row] of [['categories',category],['brands',brand],['services',service],['salonists',artist],['products',product],['sections',section]]){
   const updated=await request('PATCH',`/admin/${kind}/${row._id}`,{name:`${row.name} updated`},token);assert.equal(updated.name,`${row.name} updated`);
 }
 const publicProduct=await request('GET',`/products/${product._id}`);assert.equal(publicProduct.price,1000);
 let content=await request('GET','/storefront');assert(content.sections.some(s=>s._id===section._id));
 await request('DELETE',`/admin/sections/${section._id}`,undefined,token);content=await request('GET','/storefront');assert(!content.sections.some(s=>s._id===section._id));
 await request('PATCH',`/admin/products/${product._id}`,{price:-1},token,400);
 await request('PATCH',`/admin/products/${product._id}`,{image:'javascript:alert(1)'},token,400);
 await request('PATCH',`/admin/salonists/${artist._id}`,{startHour:22,endHour:7},token,400);
 console.log('PASS: create/edit all catalog types, homepage publication, invalid input rejected.');
 const media=await request('POST','/admin/media',{data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZQAAAAASUVORK5CYII='},token,201);uploaded=media.url;
 const image=await fetch(new URL(media.url,base));assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);
 await request('POST','/admin/media',{data:'data:image/png;base64,aGVsbG8='},token,400);
 console.log('PASS: authenticated photo upload and image serving.');
 const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+2);const date=tomorrow.toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'});
 const slots=await request('GET',`/salon/availability?date=${date}&serviceId=${service._id}&salonistId=${artist._id}`);assert(slots.length>0);assert.equal(new Date(slots[0].startsAt).toLocaleTimeString('en-GB',{timeZone:'Africa/Nairobi',hour:'2-digit',minute:'2-digit'}),'07:00');
 const booking={customer:customer.user.id,service:service._id,salonist:artist._id,startsAt:slots[0].startsAt,customerName:'Verification customer',customerPhone:'0700000000',status:'confirmed',paymentStatus:'pay-at-salon'};
 const appointment=await add('appointments',booking,models.Appointment);
 await request('POST','/admin/appointments',booking,token,409);
 await request('PATCH',`/admin/appointments/${appointment._id}`,{...booking,startsAt:slots[2].startsAt},token);
 await request('PATCH',`/admin/appointments/${appointment._id}`,{...booking,startsAt:slots[2].startsAt,status:'cancelled'},token);
 console.log('PASS: editable working hours, create/reschedule/cancel booking, overlap prevention.');
 const order=await request('POST','/orders',{items:[{productId:product._id,quantity:2}],delivery:{name:'Verification customer',email:`verify-${unique}@example.test`,phone:'0700000000',address:'Verification address',county:'Nairobi',town:'Nairobi'},paymentMethod:'cash-on-delivery'},customer.token,201);created.push([models.Order,order._id]);assert.equal(order.subtotal,2000);assert.equal((await request('GET',`/products/${product._id}`)).stock,8);
 await request('PATCH',`/admin/orders/${order._id}`,{status:'processing'},token);
 await request('DELETE',`/admin/products/${product._id}`,undefined,token);await request('GET',`/products/${product._id}`,undefined,undefined,404);
 console.log('PASS: transactional checkout, stock updates, order management and product hiding.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{for(const [Model,id] of created.reverse())await Model.deleteOne({_id:id});if(uploaded&&/^\/uploads\/[a-f0-9-]+\.png$/.test(uploaded))await fs.unlink(path.resolve(__dirname,'..',uploaded.slice(1)));await mongoose.disconnect();console.log('Disposable verification records removed.');});
