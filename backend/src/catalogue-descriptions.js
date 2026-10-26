const SOURCE_PLACEHOLDER = /^Catalogue (?:draft|listing collected) from .+? Kenya\./i;

const categoryKinds = {
  Makeup: 'makeup product',
  Skincare: 'skincare product',
  'Body Care': 'body care product',
  'Men’s Grooming': 'grooming product',
  'Beauty Tools': 'beauty tool',
  'Wigs & Extensions': 'wig or hair extension',
  Nails: 'nail care product',
  Fragrance: 'fragrance',
  Haircare: 'hair care product',
  'Braids & Hair Extensions': 'braiding or hair extension product',
};

function productDescription(product) {
  const name = String(product.name || '').replace(/\bJumia\b/gi, '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  const brand = String(product.brand || '').replace(/\bJumia\b/gi, '').trim();
  const kind = categoryKinds[product.category] || 'beauty product';
  if (!name) throw new Error('A product name is required to write its description.');
  return `${name}. This ${kind}${brand ? ` is from ${brand}` : ''} and is available at Nirvana Beauty Shop & Salon.`;
}

module.exports = { SOURCE_PLACEHOLDER, productDescription };
