const sizePattern = /\b\d+(?:\.\d+)?\s*(?:ml|l|g|kg|oz|cl)\b/gi;

function choiceValues(option) {
  const attributes = option.attributes || [];
  const names = attributes.map(attribute => String(attribute.name || '').toLowerCase());
  const authoritativeSizes = attributes.flatMap(attribute => sizeTokens(attribute.value));
  const legacy = [names.some(name => /volume|size|capacity/.test(name)) ? '' : option.volume, names.some(name => /colou?r|shade/.test(name)) ? '' : option.color]
    .map(value => authoritativeSizes.length && sizeTokens(value).some(size => !authoritativeSizes.includes(size)) ? '' : value);
  const values = [...attributes.map(attribute => attribute.value), ...legacy]
    .map(value => String(value || '').trim()).filter(Boolean);
  return values.filter((value, index) => values.findIndex(other => other.replace(/\s+/g, '').toLowerCase() === value.replace(/\s+/g, '').toLowerCase()) === index);
}

function sizeTokens(value) {
  return [...String(value || '').matchAll(sizePattern)].map(match => match[0].replace(/\s+/g, '').toLowerCase());
}

function optionSearchText(option) {
  const choices = choiceValues(option);
  const label = String(option.label || '').trim();
  const labelSizes = sizeTokens(label);
  const choiceSizes = choices.flatMap(sizeTokens);
  const staleSize = choiceSizes.length && labelSizes.some(size => !choiceSizes.includes(size));
  const correctedLabel = staleSize ? label.replace(sizePattern, match => choiceSizes.includes(match.replace(/\s+/g, '').toLowerCase()) ? match : ' ').replace(/[\s·—–-]+$/g, '').trim() : label;
  const usefulLabel = correctedLabel && !/^standard$/i.test(correctedLabel) ? correctedLabel : '';
  const compactLabel = usefulLabel.replace(/\s+/g, '').toLowerCase();
  const details = choiceSizes.length && sizeTokens(option.details).some(size => !choiceSizes.includes(size)) ? '' : option.details;
  return [usefulLabel, ...choices.filter(choice => !compactLabel.includes(choice.replace(/\s+/g, '').toLowerCase())), details].filter(Boolean).join(' ');
}

function optionDisplayName(option) {
  return optionSearchText({ label: option.label, volume: option.volume, color: option.color, attributes: option.attributes }).trim().replace(/\s+/g, ' ') || 'Standard';
}

function productSearchText(product) {
  const choices = (product.options || []).flatMap(choiceValues);
  const sizes = [...new Set(choices.flatMap(sizeTokens))];
  const fields = [product.name, product.brand, product.category, product.description, product.sku];
  if (sizes.length > 1) return fields.map(value => String(value || '').replace(sizePattern, ' ')).join(' ');
  return fields.join(' ');
}

module.exports = { choiceValues, optionDisplayName, optionSearchText, productSearchText };
