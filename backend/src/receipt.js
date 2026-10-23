// Branded, dependency-free PDF receipt built from the saved order snapshot.
const ascii=value=>String(value??'').normalize('NFKD').replace(/[^\x20-\x7e]/g,'-').replace(/[\\()]/g,'\\$&');
const money=value=>`KSh ${Number(value||0).toLocaleString('en-KE')}`;
const palette={pink:'0.94 0.00 0.45',plum:'0.24 0.08 0.21',blush:'1.00 0.93 0.97',pale:'1.00 0.98 0.99',line:'0.95 0.78 0.87',muted:'0.48 0.38 0.46',white:'1 1 1'};
function receiptPdf(order,settings={}){
  const items=order.items||[];
  const chunks=[items.slice(0,8)];for(let i=8;i<items.length;i+=12)chunks.push(items.slice(i,i+12));
  const streams=[],pageHeights=[];
  for(let page=0;page<chunks.length;page++){
    const ops=[];
    const finalPage=page===chunks.length-1;
    const shift=finalPage?(page===0?8-chunks[page].length:12-chunks[page].length)*40:0;
    pageHeights.push(960-shift);
    const box=(x,y,w,h,color)=>ops.push(`${palette[color]} rg ${x} ${y} ${w} ${h} re f`);
    const rule=(x1,y1,x2,y2,color='line',width=1)=>ops.push(`${palette[color]} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
    const label=(value,x,y,size=10,color='plum',bold=false)=>ops.push(`${palette[color]} rg BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${ascii(value)}) Tj ET`);
    box(0,814,390,146,'pink');box(0,shift,390,34,'blush');box(0,814,7,146,'plum');
    box(304,870,55,55,'white');label('N',320,883,34,'pink',true);
    label('NIRVANA',27,912,25,'white',true);label('BEAUTY SHOP & SALON',28,887,10,'white',true);
    label(page===0?'A little beauty, beautifully yours.':'Your order, continued.',28,849,12,'white');
    label(`RECEIPT ${page+1} / ${chunks.length}`,28,829,9,'white',true);
    if(page===0){
      label('YOUR RECEIPT',27,784,21,'pink',true);
      label(`Order ${order.orderNumber}`,28,758,12,'plum',true);
      label(new Date(order.createdAt).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}),28,738,10,'muted');
      box(25,596,340,125,'pale');box(25,596,4,125,'pink');
      label('PREPARED FOR',39,701,9,'pink',true);label(String(order.delivery?.name||'Customer').slice(0,27),39,682,13,'plum',true);
      label(String(order.delivery?.email||'').slice(0,35),39,663,10,'muted');
      label(String(order.delivery?.phone||'').slice(0,30),39,648,9,'muted');
      label(order.fulfilment==='pickup'?'COLLECT AT NIRVANA':'DELIVER TO',39,633,9,'pink',true);
      const destination=order.fulfilment==='pickup'?(settings.address||'Moi University, Eldoret'):[order.delivery?.address,order.delivery?.room,order.delivery?.landmark,order.delivery?.town,order.delivery?.county].filter(Boolean).join(', ');
      label(String(destination).slice(0,60),39,617,9,'plum',true);
      label(String(destination).slice(60,120),39,603,9,'muted');
      label('YOUR BEAUTY FINDS',27,578,12,'plum',true);
    }else{
      label('YOUR BEAUTY FINDS',27,783,18,'pink',true);
      label(`Order ${order.orderNumber}`,28,759,11,'muted');
    }
    const headerY=page===0?542:720;
    box(25,headerY,340,27,'plum');
    label('ITEM / COLOUR / STYLE',38,headerY+9,9,'white',true);label('AMOUNT',295,headerY+9,9,'white',true);
    let y=headerY-38;
    for(let i=0;i<chunks[page].length;i++){
      const item=chunks[page][i];if(i%2===0)box(25,y-13,340,40,'pale');
      label(String(item.name||'Beauty item').slice(0,30),38,y+10,11,'plum',true);
      const detail=[`${item.quantity} x ${money(item.unitPrice)}`,item.colour,item.variant].filter(Boolean).join('  /  ');
      label(detail.slice(0,50),38,y-8,9,'muted');
      label(money(item.lineTotal),282,y+3,11,'pink',true);
      y-=40;
    }
    rule(25,y+28,365,y+28);
    const summaryY=finalPage?Math.max(69,y-160):0;
    if(finalPage){
      box(25,summaryY,340,136,'blush');
      label('ORDER SUMMARY',39,summaryY+112,10,'pink',true);
      label('Subtotal',39,summaryY+85,11,'muted');label(money(order.subtotal),274,summaryY+85,11,'plum',true);
      label(order.fulfilment==='pickup'?'Collection':'Delivery',39,summaryY+61,11,'muted');label(order.fulfilment==='pickup'?'FREE':money(order.deliveryFee),274,summaryY+61,11,'plum',true);
      rule(38,summaryY+49,351,summaryY+49,'line');
      label(order.paymentStatus==='paid'?'TOTAL PAID':'ORDER TOTAL',39,summaryY+20,16,'pink',true);label(money(order.total),264,summaryY+20,16,'pink',true);
    }else label('More beautiful finds on the next page  >',27,95,11,'pink',true);
    const footerY=finalPage?summaryY-23:46;
    label(order.paymentStatus==='paid'?'PAID':order.paymentMethod==='online'?'ONLINE PAYMENT PENDING':'PAY ON DELIVERY / COLLECTION',26,footerY,9,'plum',true);
    label('Thank you!',285,footerY,9,'pink',true);
    streams.push(`q 1 0 0 1 0 -${shift} cm\n${ops.join('\n')}\nQ`);
  }
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const pageIds=[];
  for(const [index,stream] of streams.entries()){const pageId=objects.length,contentId=pageId+1;pageIds.push(pageId);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 390 ${pageHeights[index]}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);}
  objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let output='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(output);output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output,'latin1');
}
module.exports={receiptPdf};
