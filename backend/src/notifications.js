const { Order, Appointment, User, SalonService, Salonist } = require('./models');
const { StoreSettings } = require('./models/content');
const { receiptPdf } = require('./receipt');
async function sendEmail({to,subject,html,attachment}) {
  const key=process.env.BREVO_API_KEY, sender=process.env.BREVO_SENDER_EMAIL;
  if(!key || !sender)return 'not-configured';
  const body={sender:{name:process.env.BREVO_SENDER_NAME||'Nirvana Beauty Shop & Salon',email:sender},to:[{email:to}],subject,htmlContent:html};
  if(attachment)body.attachment=[{name:attachment.name,content:attachment.data.toString('base64')}];
  const result=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw new Error(`Brevo email API returned ${result.status}`);
  return 'sent';
}
async function sendOrderEmail(id) {
  const order=await Order.findById(id).lean();if(!order)return;
  const settings=await StoreSettings.findOne({key:'store'}).lean()||{};
  const paymentText=order.paymentStatus==='paid'?'Your payment is confirmed.':order.paymentMethod==='online'?'Your online payment is pending. Approve the prompt on your phone to complete it.':`Your payment is due ${order.fulfilment==='pickup'?'when you collect':'on delivery'}.`;
  const html=`<div style="font-family:Arial,sans-serif;color:#37213b;max-width:620px;margin:auto"><div style="background:#f50081;color:white;padding:28px"><h1 style="margin:0">Nirvana Beauty Shop & Salon</h1></div><div style="padding:26px"><h2>Thank you, ${escapeHtml(order.delivery.name)}!</h2><p>We received order <b>${escapeHtml(order.orderNumber)}</b>. ${paymentText}</p><p><b>Total:</b> KSh ${order.total.toLocaleString('en-KE')}</p><p>${order.fulfilment==='pickup'?'Collect at '+escapeHtml(settings.address||'Moi University, Eldoret'):'Delivery to '+escapeHtml([order.delivery.address,order.delivery.town].join(', '))}.</p><p>Your pink order PDF is attached.</p></div></div>`;
  try{const status=await sendEmail({to:order.delivery.email,subject:`Nirvana order ${order.orderNumber}`,html,attachment:{name:`Nirvana-${order.orderNumber}.pdf`,data:receiptPdf(order,settings)}});await Order.updateOne({_id:id},{$set:{emailStatus:status}});return status}
  catch(e){console.error('Order email:',e.message);await Order.updateOne({_id:id},{$set:{emailStatus:'failed'}});return 'failed'}
}
async function sendAppointmentEmail(id) {
  const appointment=await Appointment.findById(id).lean();if(!appointment)return;
  const [customer,service,salonist,settings]=await Promise.all([User.findById(appointment.customer).lean(),SalonService.findById(appointment.service).lean(),Salonist.findById(appointment.salonist).lean(),StoreSettings.findOne({key:'store'}).lean()]);
  if(!customer?.email)return;
  const date=new Date(appointment.startsAt).toLocaleString('en-KE',{timeZone:'Africa/Nairobi',dateStyle:'full',timeStyle:'short'});
  const html=`<div style="font-family:Arial,sans-serif;color:#37213b;max-width:620px;margin:auto"><div style="background:#f50081;color:white;padding:28px"><h1>Nirvana appointment</h1></div><div style="padding:26px"><h2>You're booked, ${escapeHtml(appointment.customerName)}!</h2><p><b>${escapeHtml(service?.name||'Salon service')}</b> with ${escapeHtml(salonist?.name||'your salonist')}</p><p>${escapeHtml(date)}</p><p>${escapeHtml(settings?.address||'Moi University, Eldoret')}</p><p>Booking reference: ${escapeHtml(appointment.reference)}</p><p>Pay at the salon: KSh ${appointment.price.toLocaleString('en-KE')}</p></div></div>`;
  try{const status=await sendEmail({to:customer.email,subject:`Nirvana appointment ${appointment.reference}`,html});await Appointment.updateOne({_id:id},{$set:{emailStatus:status}});return status}
  catch(e){console.error('Appointment email:',e.message);await Appointment.updateOne({_id:id},{$set:{emailStatus:'failed'}});return 'failed'}
}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
module.exports={sendOrderEmail,sendAppointmentEmail};
