const { Product, CataloguePromotion, CataloguePriceAudit } = require('./models');

async function applyPromotion(promotion, ending = false) {
  const rows = promotion.updates || [];
  const products = await Product.find({ _id: { $in: [...new Set(rows.map((row) => row.productId))] } }).select('price compareAt options').lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const operations = [];
  const audits = [];
  for (const row of rows) {
    const product = byId.get(String(row.productId));
    const current = row.optionId ? product?.options?.find((option) => String(option._id) === row.optionId) : product;
    if (!current) throw new Error(`Product or option ${row.sku} is missing.`);
    const fromPrice = ending ? row.afterPrice : row.beforePrice;
    const toPrice = ending ? row.beforePrice : row.afterPrice;
    const fromCompare = ending ? row.afterCompareAt : row.beforeCompareAt;
    const toCompare = ending ? row.beforeCompareAt : row.afterCompareAt;
    const currentPrice = Number(current.price ?? product.price), currentCompare = Number(current.compareAt || 0);
    if (currentPrice === toPrice && currentCompare === toCompare) continue;
    if (currentPrice !== fromPrice || currentCompare !== fromCompare) throw new Error(`Price changed after scheduling for ${row.sku}; automatic update was stopped.`);
    const filter = { _id: row.productId };
    const update = row.optionId
      ? { $set: { 'options.$.price': toPrice, 'options.$.compareAt': toCompare } }
      : { $set: { price: toPrice, compareAt: toCompare } };
    if (row.optionId) { filter['options._id'] = row.optionId; filter['options.price'] = fromPrice; filter['options.compareAt'] = fromCompare === 0 ? { $in: [0, null] } : fromCompare; }
    else { filter.price = fromPrice; filter.compareAt = fromCompare === 0 ? { $in: [0, null] } : fromCompare; }
    operations.push({ updateOne: { filter, update } });
    audits.push({ productId: row.productId, optionId: row.optionId, name: row.name, sku: row.sku, beforePrice: currentPrice, afterPrice: toPrice, beforeCompareAt: currentCompare, afterCompareAt: toCompare, operation: ending ? 'promotion-restore' : 'promotion-start', reason: promotion.reason || promotion.name, adminId: promotion.createdBy, batchId: promotion._id });
  }
  if (operations.length) {
    await Product.bulkWrite(operations, { ordered: true });
    if (audits.length) await CataloguePriceAudit.insertMany(audits);
  }
  const latest = await Product.find({ _id: { $in: [...new Set(rows.map((row) => row.productId))] } }).select('price compareAt options').lean();
  const latestById = new Map(latest.map((product) => [String(product._id), product]));
  for (const row of rows) {
    const product = latestById.get(String(row.productId));
    const current = row.optionId ? product?.options?.find((option) => String(option._id) === row.optionId) : product;
    const expectedPrice = ending ? row.beforePrice : row.afterPrice;
    const expectedCompare = ending ? row.beforeCompareAt : row.afterCompareAt;
    if (!current || Number(current.price ?? product.price) !== expectedPrice || Number(current.compareAt || 0) !== expectedCompare) throw new Error(`Could not verify the scheduled price for ${row.sku}.`);
  }
}

async function processPromotions(now = new Date()) {
  const due = await CataloguePromotion.find({ $or: [{ state: 'scheduled', startsAt: { $lte: now } }, { state: 'activating' }] }).sort({ startsAt: 1 }).limit(25);
  for (const promotion of due) {
    const claimed = await CataloguePromotion.findOneAndUpdate({ _id: promotion._id, state: { $in: ['scheduled', 'activating'] } }, { $set: { state: 'activating' } }, { new: true });
    if (!claimed) continue;
    try { await applyPromotion(claimed, false); claimed.state = 'active'; claimed.activatedAt = now; claimed.lastError = ''; await claimed.save(); }
    catch (error) { claimed.state = 'failed'; claimed.lastError = String(error.message || 'Promotion activation failed').slice(0, 500); await claimed.save(); }
  }
  const ending = await CataloguePromotion.find({ $or: [{ state: 'active', endsAt: { $lte: now } }, { state: 'ending' }] }).sort({ endsAt: 1 }).limit(25);
  for (const promotion of ending) {
    const claimed = await CataloguePromotion.findOneAndUpdate({ _id: promotion._id, state: { $in: ['active', 'ending'] } }, { $set: { state: 'ending' } }, { new: true });
    if (!claimed) continue;
    try { await applyPromotion(claimed, true); claimed.state = 'completed'; claimed.completedAt = now; claimed.lastError = ''; await claimed.save(); }
    catch (error) { claimed.state = 'failed'; claimed.lastError = String(error.message || 'Promotion restoration failed').slice(0, 500); await claimed.save(); }
  }
}

function startCatalogueScheduler() {
  const tick = () => processPromotions().catch((error) => console.error('Catalogue scheduler tick failed:', error.message));
  tick();
  const timer = setInterval(tick, 15000);
  timer.unref?.();
  return timer;
}

module.exports = { processPromotions, startCatalogueScheduler, applyPromotion };
