type Option = {_id?:string;label?:string;volume?:string;color?:string;details?:string;sku?:string;attributes?:{name:string;value:string}[]};
type Product = {name:string;options?:Option[]};
const sizePattern=/\b\d+(?:\.\d+)?\s*(?:ml|l|g|kg|oz|cl)\b/gi;
const compact=(value:string)=>value.replace(/\s+/g,'').toLowerCase();
const sizes=(value:string)=>[...value.matchAll(sizePattern)].map(match=>compact(match[0]));

export function optionChoices(option:Option):string[]{
 const attributes=option.attributes||[];
 const names=attributes.map(attribute=>attribute.name.toLowerCase());
 const authoritativeSizes=attributes.flatMap(attribute=>sizes(attribute.value));
 const legacy=[names.some(name=>/volume|size|capacity/.test(name))?'':option.volume,names.some(name=>/colou?r|shade/.test(name))?'':option.color].map(value=>authoritativeSizes.length&&sizes(String(value||'')).some(size=>!authoritativeSizes.includes(size))?'':value);
 const values=[...attributes.map(attribute=>attribute.value),...legacy].map(value=>String(value||'').trim()).filter(Boolean);
 return values.filter((value,index)=>values.findIndex(other=>compact(other)===compact(value))===index);
}

export function optionDisplayName(option:Option):string{
 const choices=optionChoices(option);
 const label=String(option.label||'').trim();
 const choiceSizes=choices.flatMap(sizes);
 const stale=choiceSizes.length>0&&sizes(label).some(size=>!choiceSizes.includes(size));
 const corrected=stale?label.replace(sizePattern,match=>choiceSizes.includes(compact(match))?match:' ').replace(/[\s·—–-]+$/g,'').trim():label;
 const custom=corrected&&!/^standard$/i.test(corrected)?corrected:'';
 return [custom,...choices.filter(choice=>!compact(custom).includes(compact(choice)))].filter(Boolean).join(' · ').replace(/\s+/g,' ')||'Standard';
}

export function productOptionName(product:Product,option?:Option):string{
 if(!option)return product.name;
 const allSizes=[...new Set((product.options||[]).flatMap(item=>optionChoices(item).flatMap(sizes)))];
 const base=allSizes.length>1&&sizes(product.name).some(size=>allSizes.includes(size))
  ? product.name.replace(/\s*[-–—]?\s*\d+(?:\.\d+)?\s*(?:ml|l|g|kg|oz|cl)\s*$/i,'').trim()||product.name
  : product.name;
 const title=optionDisplayName(option);
 const full=title.toLowerCase().startsWith(base.toLowerCase())?title:`${base} — ${title}`;
 const duplicates=(product.options||[]).filter(item=>optionDisplayName(item).toLowerCase()===title.toLowerCase());
 const index=(product.options||[]).findIndex(item=>item===option||(item._id&&item._id===option._id));
 const suffix=duplicates.length>1?` · ${option.sku?`SKU ${option.sku}`:`Option ${index+1}`}`:'';
 return full+suffix;
}
