const test = require('node:test');
const assert = require('node:assert/strict');
const { optionDisplayName, optionSearchText, productSearchText } = require('../src/product-option-search');

test('a changed size overrides an old option label and legacy volume', () => {
  const option = { label: '200ml', volume: '200ml', attributes: [{ name: 'Size', value: '400ml' }] };
  assert.equal(optionDisplayName(option), '400ml');
  assert.equal(optionSearchText(option), '400ml');
});

test('a changed size keeps the specific option name', () => {
  const option = { label: 'Amara Cocoa butter · 200ml', attributes: [{ name: 'Volume', value: '400ml' }] };
  assert.equal(optionDisplayName(option), 'Amara Cocoa butter 400ml');
});

test('shared product size does not make every option match that size', () => {
  const product = {
    name: 'Amara Lotion 200ml', brand: 'Amara', category: 'Lotion', description: 'Amara Lotion 200ml', sku: 'AMARA-200ML',
    options: [
      { label: '200ml', attributes: [{ name: 'Size', value: '200ml' }] },
      { label: '200ml', attributes: [{ name: 'Size', value: '400ml' }] }
    ]
  };
  assert.doesNotMatch(productSearchText(product), /200ml/i);
  assert.equal(optionSearchText(product.options[1]), '400ml');
  assert.equal(optionSearchText(product.options[0]), '200ml');
});
