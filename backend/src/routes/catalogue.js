const express = require('express');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { z } = require('zod');
const { Product, Category, Brand, CatalogueImport, CataloguePricePreview, CataloguePriceAudit, CataloguePromotion } = require('../models');

const router = express.Router();
const MAX_ROWS = 10000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (value) => String(value ?? '').trim();
const slugify = (value) => norm(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const filenameSafe = (value) => norm(value).replace(/[\\/\0]/g, '').slice(0, 180) || 'catalogue-import';
const roundMoney = (value) => Math.round(value);
const respondError = (res, status, error, fieldErrors) => res.status(status).json({ error, ...(fieldErrors?.length ? { fieldErrors } : {}) });

const catalogueFilter = (input = {}) => {
  const filter = {};
  if (input.q) {
    const q = escapeRegex(String(input.q).trim().slice(0, 100));
    filter.$or = [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }, { barcode: { $regex: q, $options: 'i' } }, { brand: { $regex: q, $options: 'i' } }, { category: { $regex: q, $options: 'i' } }];
    if (/^[a-f\d]{24}$/i.test(String(input.q))) filter.$or.push({ _id: input.q });
  }
  if (input.category) filter.category = String(input.category).slice(0, 120);
  if (input.brand) filter.brand = String(input.brand).slice(0, 120);
  if (input.published === 'true') filter.published = true;
  if (input.published === 'false') filter.published = false;
  if (input.stock === 'low') filter.stock = { $lte: 5 };
  if (input.stock === 'out') filter.stock = { $lte: 0 };
  if (input.stock === 'in') filter.stock = { $gt: 0 };
  const min = input.minPrice === '' || input.minPrice === undefined ? null : Number(input.minPrice);
  const max = input.maxPrice === '' || input.maxPrice === undefined ? null : Number(input.maxPrice);
  if (min !== null || max !== null) filter.price = { ...(min !== null && Number.isFinite(min) ? { $gte: min } : {}), ...(max !== null && Number.isFinite(max) ? { $lte: max } : {}) };
  return filter;
};

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const filter = catalogueFilter(req.query);
    const sortBy = ['name', 'sku', 'brand', 'category', 'price', 'stock', 'published', 'updatedAt'].includes(req.query.sortBy) ? req.query.sortBy : 'updatedAt';
    const direction = req.query.direction === 'asc' ? 1 : -1;
    const [items, total, categories, brands, lowStock, needsAttention] = await Promise.all([
      Product.find(filter).sort({ [sortBy]: direction, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
      Category.find().select('name').sort({ name: 1 }).lean(),
      Brand.find().select('name').sort({ name: 1 }).lean(),
      Product.countDocuments({ stock: { $lte: 5 } }),
      Product.countDocuments({ $or: [{ image: '' }, { image: { $exists: false } }, { price: { $lt: 0 } }, { stock: { $lte: 5 } }] }),
    ]);
    res.json({ items, page, pages: Math.max(1, Math.ceil(total / limit)), total, categories: categories.map((x) => x.name), brands: brands.map((x) => x.name), attention: { lowStock, needsAttention } });
  } catch (error) { next(error); }
});

function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((cell) => norm(cell))) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new Error('The CSV file has an unclosed quoted field.');
  if (field.length || row.length) { row.push(field); if (row.some((cell) => norm(cell))) rows.push(row); }
  if (!rows.length) throw new Error('The file does not contain a header row.');
  const headers = rows.shift().map((value) => norm(value));
  return rows.slice(0, MAX_ROWS).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function decodeRows(req) {
  const input = z.object({ filename: z.string().min(1).max(180), data: z.string().min(1).max(12 * 1024 * 1024) }).parse(req.body);
  const fileName = filenameSafe(input.filename);
  if (/\.csv$/i.test(fileName)) {
    if (Buffer.byteLength(input.data, 'utf8') > MAX_FILE_BYTES) throw new Error('CSV files must be smaller than 8 MB.');
    return { filename: fileName, rows: parseCsv(input.data) };
  }
  if (/\.xlsx$/i.test(fileName)) {
    const buffer = Buffer.from(input.data, 'base64');
    if (!buffer.length || buffer.length > MAX_FILE_BYTES || input.data.length > 12 * 1024 * 1024) throw new Error('Excel files must be smaller than 8 MB.');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer, { ignoreNodes: ['drawing', 'hyperlinks', 'dataValidations', 'conditionalFormatting', 'extLst'] });
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('The Excel file does not contain a worksheet.');
    const headers = sheet.getRow(1).values.slice(1).map((value) => norm(value?.text ?? value?.result ?? value));
    const rows = [];
    for (let rowNum = 2; rowNum <= sheet.rowCount && rows.length < MAX_ROWS; rowNum++) {
      const row = sheet.getRow(rowNum);
      const values = headers.map((_, index) => {
        const cell = row.getCell(index + 1).value;
        if (cell && typeof cell === 'object') return cell.formula || cell.sharedFormula ? '' : norm(cell.text ?? cell.hyperlink ?? '');
        return norm(cell);
      });
      if (values.some(norm)) rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
    }
    return { filename: fileName, rows };
  }
  throw new Error('Choose a .csv or .xlsx file.');
}

const aliases = {
  sku: ['sku', 'product sku', 'stock keeping unit'], name: ['name', 'product name', 'title'], description: ['description', 'product description'],
  brand: ['brand', 'brand name'], category: ['category', 'product category'], subcategory: ['subcategory', 'sub category'],
  price: ['price', 'regular price', 'regularprice', 'price kes', 'price (kes)'], saleprice: ['sale price', 'saleprice', 'discount price'],
  compareat: ['compare at', 'compareat', 'original price'], stock: ['stock', 'quantity', 'stock quantity', 'inventory'],
  image: ['image', 'image url', 'imageurl', 'primary image'], additionalimages: ['additional image urls', 'additionalimages', 'gallery images'],
  barcode: ['barcode', 'ean', 'upc'], status: ['status', 'published', 'publication status'], supplierref: ['supplier reference', 'supplierref', 'supplier sku'],
};
const headerKey = (value) => String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
function normalizeImportRow(row) {
  const source = Object.fromEntries(Object.entries(row).map(([key, value]) => [headerKey(key), value]));
  const result = {};
  for (const [key, keys] of Object.entries(aliases)) {
    const found = keys.find((alias) => Object.hasOwn(source, alias));
    if (found) result[key] = source[found];
  }
  return result;
}
const numberField = (value, label, { optional = false, max = 10000000 } = {}) => {
  if (value === undefined || norm(value) === '') return optional ? undefined : null;
  const number = Number(String(value).replace(/[,\s]/g, ''));
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw new Error(`${label} must be a whole number between 0 and ${max.toLocaleString()}.`);
  return number;
};
const textField = (value, label, max = 4000) => {
  const text = norm(value);
  if (text.length > max) throw new Error(`${label} is too long (maximum ${max} characters).`);
  return text;
};
const validImageUrl = (value) => {
  const url = norm(value);
  if (!url) return '';
  let parsed; try { parsed = new URL(url); } catch { throw new Error('Image URL must be a valid HTTP or HTTPS URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || url.length > 2000) throw new Error('Image URL must be a valid HTTP or HTTPS URL.');
  return url;
};
const storedImageUrl = z.string().trim().max(2000).refine((value) => /^\/uploads\/[a-f\d-]+\.(jpg|png|webp)$/i.test(value) || (() => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } })(), 'Choose a valid uploaded image or HTTP/HTTPS image URL.');
function convertRows(rawRows, mode) {
  const seen = new Set(); const records = []; const errors = [];
  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    try {
      const item = normalizeImportRow(raw);
      const sku = textField(item.sku, 'SKU', 140).toUpperCase();
      if (!sku) throw new Error('SKU is required so the import can safely match products.');
      if (seen.has(sku)) throw new Error(`Duplicate SKU ${sku} in this file.`);
      seen.add(sku);
      const has = (key) => Object.hasOwn(item, key);
      const record = { sku, rowNumber };
      if (has('name')) record.name = textField(item.name, 'Product name', 140);
      if (has('description')) record.description = textField(item.description, 'Description');
      if (has('brand')) record.brand = textField(item.brand, 'Brand', 120);
      if (has('category')) record.category = textField(item.category, 'Category', 120);
      if (has('subcategory')) record.subcategory = textField(item.subcategory, 'Subcategory', 120);
      if (has('barcode')) record.barcode = textField(item.barcode, 'Barcode', 80);
      if (has('supplierref')) record.supplierRef = textField(item.supplierref, 'Supplier reference', 120);
      if (has('price') || has('saleprice')) {
        const regular = has('price') ? numberField(item.price, 'Regular price') : undefined;
        const sale = has('saleprice') ? numberField(item.saleprice, 'Sale price', { optional: true }) : undefined;
        if (regular === null && sale === undefined) throw new Error('Enter a valid regular price.');
        if (sale !== undefined && regular === undefined) throw new Error('Add the regular price when setting a sale price.');
        if (sale !== undefined && regular !== undefined && sale > regular) throw new Error('Sale price cannot be higher than regular price.');
        record.price = sale !== undefined ? sale : regular;
        record.compareAt = sale !== undefined ? regular : 0;
        if (record.price === null || record.price === undefined) throw new Error('A regular price is required when using a sale price.');
      }
      if (has('stock')) record.stock = numberField(item.stock, 'Stock quantity', { max: 1000000 });
      if (has('image')) record.image = validImageUrl(item.image);
      if (has('additionalimages')) record.additionalImages = String(item.additionalimages || '').split(/[;|\n]/).map(validImageUrl).filter(Boolean).slice(0, 20);
      if (has('status')) {
        const value = norm(item.status).toLowerCase();
        if (['true', '1', 'yes', 'active', 'published', 'visible'].includes(value)) record.published = true;
        else if (['false', '0', 'no', 'inactive', 'unpublished', 'hidden', 'draft'].includes(value)) record.published = false;
        else throw new Error('Status must be Published/Hidden or true/false.');
      }
      if (mode !== 'update') {
        if (!record.name) throw new Error('Product name is required for new products.');
        if (!record.category) throw new Error('Category is required for new products.');
        if (record.price === undefined) throw new Error('Regular price is required for new products.');
      } else if (Object.keys(record).length <= 2) throw new Error('Add at least one field to update.');
      records.push(record);
    } catch (error) {
      let sku = ''; try { sku = String(normalizeImportRow(raw).sku || '').slice(0, 140); } catch {}
      errors.push({ row: rowNumber, sku, reason: String(error.message || 'Invalid record.').slice(0, 500) });
    }
  });
  return { records, errors };
}

const fileBody = express.json({ limit: '12mb' });
router.get('/template.csv', (req, res) => {
  const csv = 'SKU,Product Name,Description,Brand,Category,Subcategory,Regular Price,Sale Price,Stock Quantity,Image URL,Additional Image URLs,Barcode,Status,Supplier Reference\nNV-EXAMPLE-001,Example Lotion,Daily body lotion,Example Brand,Body Care,Lotions,450,,12,https://example.com/product.jpg,,1234567890,Published,SUP-001\n';
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nirvana-catalogue-template.csv"', 'Cache-Control': 'no-store' }).send(csv);
});
router.get('/template.xlsx', async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Products');
    sheet.addRow(['SKU', 'Product Name', 'Description', 'Brand', 'Category', 'Subcategory', 'Regular Price', 'Sale Price', 'Stock Quantity', 'Image URL', 'Additional Image URLs', 'Barcode', 'Status', 'Supplier Reference']);
    sheet.addRow(['NV-EXAMPLE-001', 'Example Lotion', 'Daily body lotion', 'Example Brand', 'Body Care', 'Lotions', 450, '', 12, 'https://example.com/product.jpg', '', '1234567890', 'Published', 'SUP-001']);
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="nirvana-catalogue-template.xlsx"', 'Cache-Control': 'no-store' }).send(Buffer.from(buffer));
  } catch (error) { next(error); }
});

router.post('/import/preview', fileBody, async (req, res) => {
  try {
    const { filename, rows } = await decodeRows(req);
    if (!rows.length) return respondError(res, 400, 'The file does not contain any product rows.');
    if (rows.length >= MAX_ROWS) return respondError(res, 400, `Imports are limited to ${MAX_ROWS.toLocaleString()} rows per file.`);
    const mode = z.enum(['create', 'update', 'both']).parse(req.body.mode || 'both');
    const converted = convertRows(rows, mode);
    const skuList = converted.records.map((row) => row.sku);
    const matches = await Product.find({ sku: { $in: skuList } }).select('sku name price compareAt stock published').lean();
    const existing = new Map(matches.map((item) => [item.sku.toUpperCase(), item]));
    const plan = converted.records.map((record) => {
      const found = existing.get(record.sku);
      if (found && mode === 'create') converted.errors.push({ row: record.rowNumber, sku: record.sku, reason: 'SKU already exists. Choose Update existing or Create and update.' });
      else if (!found && mode === 'update') converted.errors.push({ row: record.rowNumber, sku: record.sku, reason: 'SKU was not found, so update-only mode skipped this row.' });
      return { row: record.rowNumber, sku: record.sku, name: record.name || found?.name || '', action: found ? (mode === 'create' ? 'skip' : 'update') : (mode === 'update' ? 'skip' : 'create'), currentPrice: found?.price, proposedPrice: record.price ?? found?.price, currentStock: found?.stock, proposedStock: record.stock ?? found?.stock };
    });
    const rejectedRows = new Set(converted.errors.map((error) => error.row));
    res.json({ filename, mode, total: rows.length, valid: plan.filter((item) => item.action !== 'skip' && !rejectedRows.has(item.row)).length, rejected: rejectedRows.size, created: plan.filter((item) => item.action === 'create' && !rejectedRows.has(item.row)).length, updated: plan.filter((item) => item.action === 'update' && !rejectedRows.has(item.row)).length, errors: converted.errors.slice(0, 500), preview: plan.slice(0, 100) });
  } catch (error) { if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message); respondError(res, 400, error.message || 'Could not read the import file.'); }
});

router.post('/import', fileBody, async (req, res, next) => {
  let log;
  try {
    const { filename, rows } = await decodeRows(req);
    const mode = z.enum(['create', 'update', 'both']).parse(req.body.mode || 'both');
    if (!rows.length) return respondError(res, 400, 'The file does not contain any product rows.');
    if (rows.length >= MAX_ROWS) return respondError(res, 400, `Imports are limited to ${MAX_ROWS.toLocaleString()} rows per file.`);
    const converted = convertRows(rows, mode);
    const existingProducts = await Product.find({ sku: { $in: converted.records.map((row) => row.sku) } }).lean();
    const existing = new Map(existingProducts.map((item) => [item.sku.toUpperCase(), item]));
    const accepted = [];
    let skipped = 0;
    const errorRows = [...converted.errors];
    for (const record of converted.records) {
      const found = existing.get(record.sku);
      if (found && mode === 'create') { skipped++; errorRows.push({ row: record.rowNumber, sku: record.sku, reason: 'SKU already exists.' }); continue; }
      if (!found && mode === 'update') { skipped++; errorRows.push({ row: record.rowNumber, sku: record.sku, reason: 'SKU was not found.' }); continue; }
      accepted.push({ record, found });
    }
    const rejectedRowNumbers = new Set(converted.errors.map((item) => item.row));
    const ready = accepted.filter(({ record }) => !rejectedRowNumbers.has(record.rowNumber));
    let created = 0, updated = 0;
    const operations = ready.map(({ record, found }) => {
      const values = { ...record }; delete values.rowNumber; delete values.sku;
      if (found) return { updateOne: { filter: { _id: found._id, sku: record.sku }, update: { $set: values }, upsert: false } };
      const slugBase = slugify(record.name);
      const slug = `${slugBase || 'product'}-${slugify(record.sku).slice(-28)}-${crypto.createHash('sha1').update(record.sku).digest('hex').slice(0, 6)}`;
      return { updateOne: { filter: { sku: record.sku }, update: { $setOnInsert: { ...values, sku: record.sku, slug, name: record.name, category: record.category, price: record.price, stock: record.stock ?? 0, brand: record.brand || '', description: record.description || '', image: record.image || '', additionalImages: record.additionalImages || [], barcode: record.barcode || '', supplierRef: record.supplierRef || '', subcategory: record.subcategory || '', compareAt: record.compareAt || 0, options: [], published: record.published ?? true, featured: false, tags: ['catalogue-import'] } }, upsert: true } };
    });
    const categories = [...new Set(ready.map(({ record }) => record.category).filter(Boolean))];
    const brands = [...new Set(ready.map(({ record }) => record.brand).filter(Boolean))];
    await Promise.all([
      Category.bulkWrite(categories.map((name) => ({ updateOne: { filter: { name }, update: { $setOnInsert: { name, slug: slugify(name), active: true, sortOrder: 20 } }, upsert: true } })), { ordered: false }),
      Brand.bulkWrite(brands.map((name) => ({ updateOne: { filter: { name }, update: { $setOnInsert: { name } }, upsert: true } })), { ordered: false }),
    ]);
    for (let offset = 0; offset < operations.length; offset += 250) {
      const chunk = operations.slice(offset, offset + 250);
      const result = await Product.bulkWrite(chunk, { ordered: false });
      created += result.upsertedCount || 0; updated += result.matchedCount || 0;
    }
    const status = errorRows.length ? (created + updated ? 'partial' : 'failed') : 'completed';
    log = await CatalogueImport.create({ filename, mode, status, total: rows.length, created, updated, skipped, rejected: errorRows.length, rowErrors: errorRows.slice(0, 5000).map(({ row, sku, reason }) => ({ row, sku, reason: String(reason).slice(0, 500) })), createdBy: req.auth.sub });
    res.status(201).json({ importId: log._id, status, total: rows.length, created, updated, skipped, rejected: errorRows.length, errors: errorRows.slice(0, 100) });
  } catch (error) {
    if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message);
    next(error);
  }
});

router.get('/imports', async (req, res, next) => {
  try { res.json(await CatalogueImport.find().sort({ createdAt: -1 }).limit(100).lean()); } catch (error) { next(error); }
});
function csvSafe(value) { const text = String(value ?? ''); return /^[=+@\-\t\r]/.test(text) ? `'${text}` : text; }
router.get('/imports/:id/errors.csv', async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return respondError(res, 400, 'Invalid import record.');
    const log = await CatalogueImport.findById(req.params.id).lean(); if (!log) return respondError(res, 404, 'Import history was not found.');
    const csv = ['Row,SKU,Error', ...(log.rowErrors || []).map((item) => [item.row, item.sku, item.reason].map((value) => `"${csvSafe(value).replace(/"/g, '""')}"`).join(','))].join('\r\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="import-${log._id}-errors.csv"`, 'Cache-Control': 'no-store' }).send(csv);
  } catch (error) { next(error); }
});

const bulkSchema = z.object({ ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(1000), action: z.enum(['publish', 'hide', 'set-stock', 'archive']), stock: z.number().int().min(0).max(1000000).optional(), confirmation: z.string().optional() });
router.post('/bulk', async (req, res, next) => {
  try {
    const input = bulkSchema.parse(req.body); if (new Set(input.ids).size !== input.ids.length) return respondError(res, 400, 'Remove duplicate products from the selection.');
    if (input.action === 'set-stock' && input.stock === undefined) return respondError(res, 400, 'Enter the stock quantity to apply.');
    if (input.action === 'archive' && input.confirmation !== 'ARCHIVE SELECTED PRODUCTS') return respondError(res, 400, 'Type ARCHIVE SELECTED PRODUCTS to confirm.');
    const update = input.action === 'publish' ? { $set: { published: true } } : input.action === 'hide' || input.action === 'archive' ? { $set: { published: false } } : { $set: { stock: input.stock } };
    const result = await Product.updateMany({ _id: { $in: input.ids } }, update);
    res.json({ matched: result.matchedCount, updated: result.modifiedCount, action: input.action });
  } catch (error) { if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message); next(error); }
});

const priceInput = z.object({ method: z.enum(['set', 'increase-percent', 'decrease-percent', 'increase-amount', 'decrease-amount', 'sale-price', 'discount-percent', 'restore']), amount: z.number().finite().min(0).max(10000000).optional(), reason: z.string().trim().max(300).default(''), ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5000).optional(), filters: z.object({ q: z.string().max(100).optional(), category: z.string().max(120).optional(), brand: z.string().max(120).optional(), published: z.enum(['true', 'false', '']).optional(), stock: z.enum(['in', 'out', 'low', '']).optional(), minPrice: z.union([z.string(), z.number()]).optional(), maxPrice: z.union([z.string(), z.number()]).optional() }).optional(), entireCatalogue: z.boolean().default(false), confirmation: z.string().optional() });
function calculatePrice(method, amount, current, compareAt) {
  if (method === 'restore') return { price: compareAt > 0 && compareAt > current ? compareAt : current, compareAt: 0 };
  if (!Number.isFinite(amount)) throw new Error('Enter a price or adjustment amount.');
  if (method === 'set' || method === 'sale-price') return { price: roundMoney(amount), compareAt: method === 'sale-price' ? (compareAt > current ? compareAt : current) : 0 };
  if (method === 'increase-percent' || method === 'decrease-percent' || method === 'discount-percent') {
    if (amount > 500) throw new Error('Percentage adjustments are limited to 500%.');
    const basisPoints = Math.round(amount * 100);
    const delta = roundMoney(current * basisPoints / 10000);
    const next = method === 'increase-percent' ? current + delta : current - delta;
    return { price: next, compareAt: method === 'discount-percent' ? (compareAt > current ? compareAt : current) : 0 };
  }
  return { price: method === 'increase-amount' ? current + roundMoney(amount) : current - roundMoney(amount), compareAt: 0 };
}
async function selectedProducts(input) {
  if (input.entireCatalogue && input.confirmation !== 'PREVIEW ENTIRE CATALOGUE') throw new Error('Type PREVIEW ENTIRE CATALOGUE to preview an all-products price change.');
  if (input.ids?.length) return Product.find({ _id: { $in: input.ids } }).select('name sku price compareAt options').lean();
  if (!input.filters) throw new Error('Select products or choose filters for the price update.');
  if (!input.entireCatalogue && !Object.values(input.filters).some((value) => value !== undefined && value !== '')) throw new Error('Choose at least one filter, or explicitly select the entire catalogue.');
  return Product.find(catalogueFilter(input.filters)).select('name sku price compareAt options').limit(5001).lean();
}
router.post('/price-preview', async (req, res) => {
  try {
    const input = priceInput.parse(req.body);
    if (input.method !== 'restore' && input.amount === undefined) return respondError(res, 400, 'Enter an update amount.');
    if (input.method === 'sale-price' && input.amount === undefined) return respondError(res, 400, 'Enter the sale price.');
    const products = await selectedProducts({ ...input, confirmation: input.entireCatalogue ? 'PREVIEW ENTIRE CATALOGUE' : input.confirmation });
    if (products.length > 5000) return respondError(res, 400, 'This change matches more than 5,000 products. Narrow the filters before continuing.');
    if (!products.length) return respondError(res, 400, 'No products matched your selection.');
    const updates = [];
    for (const product of products) {
      if (product.options?.length) {
        for (const option of product.options) {
          const before = Number(option.price ?? product.price), beforeCompare = Number(option.compareAt || 0);
          const proposed = calculatePrice(input.method, input.amount, before, beforeCompare);
          if (![proposed.price, proposed.compareAt].every((value) => Number.isSafeInteger(value)) || proposed.price < 0 || proposed.price > 10000000 || proposed.compareAt < 0 || (proposed.compareAt > 0 && proposed.compareAt < proposed.price)) return respondError(res, 400, `The proposed price is invalid for ${product.name} (${option.sku || product.sku}).`);
          if (proposed.price !== before || proposed.compareAt !== beforeCompare) updates.push({ productId: product._id, optionId: String(option._id), name: product.name, sku: option.sku || product.sku, beforePrice: before, afterPrice: proposed.price, beforeCompareAt: beforeCompare, afterCompareAt: proposed.compareAt });
        }
      } else {
        const before = Number(product.price), beforeCompare = Number(product.compareAt || 0);
        const proposed = calculatePrice(input.method, input.amount, before, beforeCompare);
        if (![proposed.price, proposed.compareAt].every((value) => Number.isSafeInteger(value)) || proposed.price < 0 || proposed.price > 10000000 || proposed.compareAt < 0 || (proposed.compareAt > 0 && proposed.compareAt < proposed.price)) return respondError(res, 400, `The proposed price is invalid for ${product.name}.`);
        if (proposed.price !== before || proposed.compareAt !== beforeCompare) updates.push({ productId: product._id, optionId: '', name: product.name, sku: product.sku, beforePrice: before, afterPrice: proposed.price, beforeCompareAt: beforeCompare, afterCompareAt: proposed.compareAt });
      }
    }
    if (!updates.length) return respondError(res, 400, 'No prices would change for this selection.');
    const preview = await CataloguePricePreview.create({ createdBy: req.auth.sub, method: input.method, reason: input.reason, itemCount: updates.length, updates, expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
    res.status(201).json({ previewId: preview._id, expiresAt: preview.expiresAt, itemCount: updates.length, productsAffected: new Set(updates.map((item) => String(item.productId))).size, updates: updates.slice(0, 100) });
  } catch (error) { if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message); respondError(res, 400, error.message); }
});
router.post('/price-apply', async (req, res, next) => {
  try {
    const input = z.object({ previewId: z.string().regex(/^[a-f\d]{24}$/i), confirmation: z.string() }).parse(req.body);
    if (input.confirmation !== 'APPLY PRICE CHANGES') return respondError(res, 400, 'Type APPLY PRICE CHANGES to confirm.');
    const preview = await CataloguePricePreview.findOne({ _id: input.previewId, createdBy: req.auth.sub, state: 'pending', expiresAt: { $gt: new Date() } });
    if (!preview) return respondError(res, 404, 'This price preview expired or has already been applied. Create a fresh preview.');
    const products = await Product.find({ _id: { $in: preview.updates.map((item) => item.productId) } }).select('name sku price compareAt options').lean();
    const byId = new Map(products.map((item) => [String(item._id), item]));
    for (const update of preview.updates) {
      const product = byId.get(String(update.productId));
      const current = update.optionId ? product?.options?.find((option) => String(option._id) === update.optionId) : product;
      if (!current || Number(current.price ?? product.price) !== update.beforePrice || Number(current.compareAt || 0) !== update.beforeCompareAt) return respondError(res, 409, `Price changed since preview for ${update.name}. Refresh the preview before applying.`);
    }
    const operations = preview.updates.map((item) => item.optionId ? {
      updateOne: { filter: { _id: item.productId, 'options._id': item.optionId }, update: { $set: { 'options.$.price': item.afterPrice, 'options.$.compareAt': item.afterCompareAt } } },
    } : { updateOne: { filter: { _id: item.productId, price: item.beforePrice }, update: { $set: { price: item.afterPrice, compareAt: item.afterCompareAt } } } });
    for (let offset = 0; offset < operations.length; offset += 250) await Product.bulkWrite(operations.slice(offset, offset + 250), { ordered: true });
    await CataloguePriceAudit.insertMany(preview.updates.map((item) => ({ ...item, operation: preview.method, reason: preview.reason, adminId: req.auth.sub, batchId: preview._id })));
    preview.state = 'applied'; preview.appliedAt = new Date(); await preview.save();
    res.json({ updated: preview.updates.length, message: `Updated ${preview.updates.length} product prices.` });
  } catch (error) { if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message); next(error); }
});
router.get('/price-history', async (req, res, next) => {
  try { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50)); const [items, total] = await Promise.all([CataloguePriceAudit.find().populate('adminId', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), CataloguePriceAudit.countDocuments()]); res.json({ items, page, pages: Math.max(1, Math.ceil(total / limit)), total }); } catch (error) { next(error); }
});

function imageSku(filename) {
  return filenameSafe(filename).replace(/\.[^.]+$/, '').trim().toUpperCase();
}
const imageMatchInput = z.object({ images: z.array(z.object({ filename: z.string().min(1).max(240), url: storedImageUrl })).min(1).max(500) });
router.post('/images/preview', async (req, res, next) => {
  try {
    const { images } = imageMatchInput.parse(req.body);
    const skus = images.map(({ filename }) => imageSku(filename));
    const products = await Product.find({ sku: { $in: skus } }).select('name sku image additionalImages').lean();
    const bySku = new Map(products.map((product) => [product.sku.toUpperCase(), product]));
    const matches = images.map((image) => {
      const sku = imageSku(image.filename);
      const product = bySku.get(sku);
      return { filename: filenameSafe(image.filename), sku, url: image.url, productId: product?._id || null, name: product?.name || '', currentImage: product?.image || '', matched: Boolean(product) };
    });
    const duplicates = new Set();
    for (const match of matches) { if (duplicates.has(match.sku)) match.error = 'More than one file has this SKU.'; duplicates.add(match.sku); }
    res.json({ total: matches.length, matched: matches.filter((item) => item.matched && !item.error).length, unmatched: matches.filter((item) => !item.matched || item.error).length, matches });
  } catch (error) { if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message); next(error); }
});
router.post('/images/apply', async (req, res, next) => {
  try {
    const input = z.object({ confirmation: z.string(), updates: z.array(z.object({ sku: z.string().trim().min(1).max(140), url: storedImageUrl })).min(1).max(500) }).parse(req.body);
    if (input.confirmation !== 'UPDATE MATCHED PRODUCT IMAGES') return respondError(res, 400, 'Type UPDATE MATCHED PRODUCT IMAGES to confirm.');
    const normalized = input.updates.map((item) => ({ sku: item.sku.trim().toUpperCase(), url: item.url }));
    if (new Set(normalized.map((item) => item.sku)).size !== normalized.length) return respondError(res, 400, 'Each product SKU can appear only once in an image update.');
    const operations = normalized.map(({ sku, url }) => ({ updateOne: { filter: { sku }, update: { $set: { image: url } } } }));
    const result = await Product.bulkWrite(operations, { ordered: false });
    res.json({ updated: result.modifiedCount, matched: result.matchedCount, missing: normalized.length - result.matchedCount });
  } catch (error) { if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message); next(error); }
});

const promotionInput = priceInput.pick({ amount: true, ids: true, filters: true, entireCatalogue: true, confirmation: true }).extend({
  name: z.string().trim().min(2).max(140), reason: z.string().trim().max(300).default(''), method: z.enum(['sale-price', 'discount-percent']),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(),
});
router.get('/promotions', async (req, res, next) => {
  try { res.json(await CataloguePromotion.find().populate('createdBy', 'name email').sort({ startsAt: -1 }).limit(100).lean()); } catch (error) { next(error); }
});
router.post('/promotions/preview', async (req, res) => {
  try {
    const input = promotionInput.parse(req.body); const start = new Date(input.startsAt), end = new Date(input.endsAt);
    if (start <= new Date() || end <= start) return respondError(res, 400, 'Choose a future start time and an end time after the start.');
    if (input.method === 'discount-percent' && (input.amount === undefined || input.amount <= 0 || input.amount > 100)) return respondError(res, 400, 'Promotion discount must be between 1% and 100%.');
    if (input.method === 'sale-price' && input.amount === undefined) return respondError(res, 400, 'Enter the sale price.');
    const products = await selectedProducts({ ...input, confirmation: input.entireCatalogue ? 'PREVIEW ENTIRE CATALOGUE' : input.confirmation });
    if (!products.length || products.length > 5000) return respondError(res, 400, products.length ? 'Promotions can include up to 5,000 products.' : 'No products matched this selection.');
    const updates = [];
    for (const product of products) for (const option of product.options?.length ? product.options : [null]) {
      const current = option || product, beforePrice = Number(current.price ?? product.price), beforeCompareAt = Number(current.compareAt || 0);
      const afterPrice = input.method === 'sale-price' ? roundMoney(input.amount) : roundMoney(beforePrice * (100 - input.amount) / 100);
      if (!Number.isSafeInteger(afterPrice) || afterPrice < 0 || afterPrice > beforePrice) return respondError(res, 400, `Promotion price must be a non-negative discount for ${product.name}.`);
      updates.push({ productId: product._id, optionId: option ? String(option._id) : '', name: product.name, sku: option?.sku || product.sku, beforePrice, afterPrice, beforeCompareAt, afterCompareAt: beforeCompareAt > beforePrice ? beforeCompareAt : beforePrice });
    }
    const conflicting = await CataloguePromotion.findOne({ state: { $in: ['scheduled', 'activating', 'active', 'ending'] }, startsAt: { $lt: end }, endsAt: { $gt: start }, 'updates.productId': { $in: [...new Set(updates.map((item) => item.productId))] } }).select('name').lean();
    if (conflicting) return respondError(res, 409, `These products already overlap promotion “${conflicting.name}”.`);
    if (input.confirmation === 'SCHEDULE PROMOTION') {
      const promo = await CataloguePromotion.create({ name: input.name, startsAt: start, endsAt: end, method: input.method, amount: input.amount, reason: input.reason, updates, createdBy: req.auth.sub });
      return res.status(201).json({ promotionId: promo._id, state: promo.state, total: updates.length, startsAt: promo.startsAt, endsAt: promo.endsAt });
    }
    res.json({ name: input.name, total: updates.length, startsAt: start, endsAt: end, updates: updates.slice(0, 100) });
  } catch (error) { if (error.name === 'ZodError') return respondError(res, 400, error.issues[0].message); respondError(res, 400, error.message); }
});
router.post('/promotions/:id/cancel', async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return respondError(res, 400, 'Invalid promotion.');
    const promotion = await CataloguePromotion.findOneAndUpdate({ _id: req.params.id, state: 'scheduled', startsAt: { $gt: new Date() } }, { $set: { state: 'cancelled' } }, { new: true });
    if (!promotion) return respondError(res, 409, 'Only promotions that have not started can be cancelled.');
    res.json({ state: promotion.state });
  } catch (error) { next(error); }
});

module.exports = { router, parseCsv, convertRows, calculatePrice };