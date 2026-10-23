function calculateOrderTotals(lines, freeDeliveryAt = 5000, deliveryFee = 250) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('An order needs at least one line item.');
  const subtotal = lines.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error('Order lines need a valid quantity and price.');
    return sum + item.quantity * item.unitPrice;
  }, 0);
  if (!Number.isSafeInteger(subtotal)) throw new Error('Order total is outside the supported range.');
  const shipping = subtotal >= freeDeliveryAt ? 0 : deliveryFee;
  return { subtotal, deliveryFee: shipping, total: subtotal + shipping };
}

function overlaps(start, end, existingStart, existingEnd) {
  const a = new Date(start).getTime(), b = new Date(end).getTime();
  const c = new Date(existingStart).getTime(), d = new Date(existingEnd).getTime();
  if (![a, b, c, d].every(Number.isFinite) || a >= b || c >= d) return false;
  return a < d && b > c;
}

function campaignIsActive(campaign, now = new Date()) {
  const point = new Date(now).getTime();
  return Boolean(campaign?.active && Number.isFinite(point) && new Date(campaign.startsAt).getTime() <= point && point < new Date(campaign.endsAt).getTime());
}

module.exports = { calculateOrderTotals, overlaps, campaignIsActive };
