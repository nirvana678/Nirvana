const { Schema, model } = require('mongoose');

const importSchema = new Schema({
  filename: { type: String, required: true, maxlength: 180 },
  source: { type: String, enum: ['file', 'image-map', 'supplier'], default: 'file' },
  mode: { type: String, enum: ['create', 'update', 'both'], default: 'both' },
  status: { type: String, enum: ['completed', 'partial', 'failed'], required: true },
  total: { type: Number, default: 0 }, created: { type: Number, default: 0 }, updated: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 }, rejected: { type: Number, default: 0 },
  rowErrors: [{ row: Number, sku: String, reason: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
importSchema.index({ createdAt: -1 });

const pricePreviewSchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  state: { type: String, enum: ['pending', 'applied', 'expired'], default: 'pending', index: true },
  method: { type: String, enum: ['set', 'increase-percent', 'decrease-percent', 'increase-amount', 'decrease-amount', 'sale-price', 'discount-percent', 'restore'], required: true },
  reason: { type: String, trim: true, maxlength: 300, default: '' },
  itemCount: { type: Number, default: 0 },
  updates: [{ _id: false, productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, optionId: { type: String, default: '' }, name: String, sku: String, beforePrice: Number, afterPrice: Number, beforeCompareAt: Number, afterCompareAt: Number }],
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  appliedAt: Date,
}, { timestamps: true });

const priceAuditSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true }, optionId: { type: String, default: '' },
  name: { type: String, required: true }, sku: { type: String, required: true },
  beforePrice: { type: Number, required: true }, afterPrice: { type: Number, required: true },
  beforeCompareAt: { type: Number, default: 0 }, afterCompareAt: { type: Number, default: 0 },
  reason: { type: String, maxlength: 300, default: '' }, operation: { type: String, required: true },
  adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, batchId: { type: Schema.Types.ObjectId, ref: 'CataloguePricePreview' },
}, { timestamps: true });
priceAuditSchema.index({ createdAt: -1 });

const promotionSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 140 },
  state: { type: String, enum: ['scheduled', 'activating', 'active', 'ending', 'completed', 'cancelled', 'failed'], default: 'scheduled', index: true },
  startsAt: { type: Date, required: true, index: true }, endsAt: { type: Date, required: true, index: true },
  method: { type: String, enum: ['sale-price', 'discount-percent'], required: true }, amount: { type: Number, required: true },
  reason: { type: String, maxlength: 300, default: '' },
  updates: [{ _id: false, productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, optionId: { type: String, default: '' }, name: String, sku: String, beforePrice: Number, afterPrice: Number, beforeCompareAt: Number, afterCompareAt: Number }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, activatedAt: Date, completedAt: Date, lastError: { type: String, maxlength: 500, default: '' },
}, { timestamps: true });
promotionSchema.index({ state: 1, startsAt: 1, endsAt: 1 });

module.exports = {
  CatalogueImport: model('CatalogueImport', importSchema),
  CataloguePricePreview: model('CataloguePricePreview', pricePreviewSchema),
  CataloguePriceAudit: model('CataloguePriceAudit', priceAuditSchema),
  CataloguePromotion: model('CataloguePromotion', promotionSchema),
};
