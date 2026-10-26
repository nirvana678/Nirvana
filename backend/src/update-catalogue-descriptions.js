require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { Product } = require('./models');
const { SOURCE_PLACEHOLDER, productDescription } = require('./catalogue-descriptions');

const cataloguePath = path.join(__dirname, 'catalogue-seed.json');
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
const descriptions = catalogue.products.map((product) => productDescription(product));
if (new Set(descriptions).size !== descriptions.length) throw new Error('Product descriptions must be unique.');

async function run() {
  const selected = process.argv.slice(2);
  if (!selected.length || selected.some((value) => !['--seed', '--database'].includes(value))) {
    throw new Error('Use --seed and/or --database to choose what to update.');
  }
  if (selected.includes('--seed')) {
    let changed = 0;
    catalogue.products.forEach((product, index) => {
      if (SOURCE_PLACEHOLDER.test(product.description || '')) {
        product.description = descriptions[index];
        changed++;
      }
    });
    fs.writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`);
    console.log(`Updated ${changed} catalogue seed descriptions.`);
  }
  if (selected.includes('--database')) {
    if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI before updating database descriptions.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    try {
      let matched = 0, updated = 0;
      for (let offset = 0; offset < catalogue.products.length; offset += 200) {
        const operations = catalogue.products.slice(offset, offset + 200).map((product, index) => ({
          updateOne: {
            filter: { slug: product.slug, description: { $regex: SOURCE_PLACEHOLDER.source, $options: 'i' } },
            update: { $set: { description: descriptions[offset + index] } },
          },
        }));
        const result = await Product.bulkWrite(operations, { ordered: false });
        matched += result.matchedCount;
        updated += result.modifiedCount;
      }
      console.log(`Updated ${updated} of ${matched} matching database descriptions. Existing custom descriptions were preserved.`);
    } finally {
      await mongoose.disconnect();
    }
  }
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });
