const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, convertRows, calculatePrice } = require('../src/routes/catalogue');

test('CSV parser handles quoted commas, escaped quotes, and CRLF', () => {
  assert.deepEqual(parseCsv('SKU,Product Name,Description\r\nA-1,"Lotion, daily","Says ""soft"""\r\n'), [
    { SKU: 'A-1', 'Product Name': 'Lotion, daily', Description: 'Says "soft"' },
  ]);
});

test('CSV parser rejects unclosed quoted fields', () => {
  assert.throws(() => parseCsv('SKU,Name\nA-1,"Open'), /unclosed quoted field/);
});

test('product import validates fields and detects duplicate SKUs', () => {
  const parsed = convertRows([
    { SKU: 'sku-1', 'Product Name': 'Lotion', Category: 'Body Care', 'Regular Price': '450', 'Sale Price': '400', 'Stock Quantity': '4' },
    { SKU: 'SKU-1', 'Product Name': 'Duplicate', Category: 'Body Care', 'Regular Price': '450' },
    { SKU: 'SKU-2', 'Product Name': 'Invalid sale', Category: 'Body Care', 'Regular Price': '450', 'Sale Price': '500' },
  ], 'both');
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].sku, 'SKU-1');
  assert.equal(parsed.records[0].price, 400);
  assert.equal(parsed.records[0].compareAt, 450);
  assert.equal(parsed.errors.length, 2);
});

test('price calculations use whole KSh and preserve regular prices for discounts', () => {
  assert.deepEqual(calculatePrice('increase-percent', 10, 455, 0), { price: 501, compareAt: 0 });
  assert.deepEqual(calculatePrice('discount-percent', 20, 800, 0), { price: 640, compareAt: 800 });
  assert.deepEqual(calculatePrice('restore', undefined, 640, 800), { price: 800, compareAt: 0 });
});
