const fs = require('fs/promises');
const path = require('path');
const target = path.resolve(__dirname, '../../frontend/public/images');
async function download(url, filename) {
  const response = await fetch(url); if (!response.ok) throw new Error(`${response.status}: ${url}`);
  await fs.writeFile(path.join(target,filename),Buffer.from(await response.arrayBuffer())); return `/images/${filename}`;
}
async function main() {
  await fs.mkdir(target,{recursive:true});
  const manifest = {};
  const catalog = await Promise.all(['beauty','fragrances','skin-care'].map(async category => {
    const response=await fetch(`https://dummyjson.com/products/category/${category}`); if(!response.ok) return []; return (await response.json()).products;
  }));
  const photos = catalog.flat();
  for (const [key, query] of Object.entries({mascara:'Mascara',lipstick:'Lipstick',powder:'Powder',eyeshadow:'Eyeshadow',nails:'Nail Polish',perfume:'Dior',cream:'Vaseline',body:'Lotion'})) {
    const item=photos.find(p=>p.title.includes(query));
    if(item) { manifest[key]=await download(item.images[0],`${key}.webp`); console.log(`${key}: ${item.title}`); }
  }
  const images={
    serum:'photo-1608248543803-ba4f8c70ae0b',haircare:'photo-1527799820374-dcf8d9d4a388',salon:'photo-1560066984-138dadb4c035',
    braids:'photo-1519699047748-de8e457a634e',facial:'photo-1570172619644-dfd03ed5d881',manicure:'photo-1604654894610-df63bc536371',
    artist1:'photo-1531123897727-8f129e1688ce',artist2:'photo-1534528741775-53994a69daeb',artist3:'photo-1524504388940-b1c1722653e1'
  };
  await Promise.all(Object.entries(images).map(async([key,photo])=>{try{manifest[key]=await download(`https://images.unsplash.com/${photo}?auto=format&fit=crop&w=${key==='salon'?1100:600}&q=85`,`${key}.jpg`);console.log(`Downloaded ${key}`);}catch(e){console.log(`Unavailable ${key}: ${e.message}`);}}));
  const fontDir=path.resolve(target,'../fonts'); await fs.mkdir(fontDir,{recursive:true});
  const fontCss=await(await fetch('https://fonts.googleapis.com/css2?family=Allura&family=Poppins:wght@400;500;600;700;800&display=swap',{headers:{'User-Agent':'Mozilla/5.0'}})).text();
  let localCss=fontCss; let index=0;
  for(const match of fontCss.matchAll(/url\((https:\/\/[^)]+)\)/g)) {
    const url=match[1], filename=`nirvana-font-${index++}.${url.includes('.woff2')?'woff2':'ttf'}`;
    const response=await fetch(url); if(!response.ok) throw new Error('Font download failed');
    await fs.writeFile(path.join(fontDir,filename),Buffer.from(await response.arrayBuffer()));
    localCss=localCss.replace(url,`/fonts/${filename}`);
  }
  await fs.writeFile(path.join(fontDir,'fonts.css'),localCss);
  await fs.writeFile(path.resolve(__dirname,'demo-assets.json'),JSON.stringify(manifest,null,2));
  console.log('Sample assets and local fonts saved.');
}
main().catch(e=>{console.error(e);process.exit(1)});
