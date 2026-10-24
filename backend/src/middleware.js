const jwt = require('jsonwebtoken');
const { User } = require('./models');
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try { req.auth = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
}
const allow = (...roles) => (req, res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
  next();
};
function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.name === 'ZodError') { const fieldErrors = err.issues.map(issue => ({ path: issue.path.join('.'), message: readableValidation(issue) })); return res.status(400).json({ error: 'Please correct the highlighted fields.', fieldErrors }); }
  if (err.fieldErrors) return res.status(err.status || 400).json({ error: 'Please correct the highlighted fields.', fieldErrors: err.fieldErrors });
  if (err.name === 'ValidationError') { const fieldErrors = Object.entries(err.errors || {}).map(([path, issue]) => ({ path, message: readableMongooseValidation(issue) })); return res.status(400).json({ error: fieldErrors.length ? 'Please correct the highlighted fields.' : err.message, ...(fieldErrors.length ? { fieldErrors } : {}) }); }
  if (err.code === 11000) { const path = Object.keys(err.keyPattern || {})[0]; const fieldErrors = path ? [{ path, message: `This ${path === 'slug' ? 'URL name' : path === 'sku' ? 'SKU' : path} is already in use. Choose a different value.` }] : []; return res.status(409).json({ error: fieldErrors.length ? 'Please correct the highlighted fields.' : 'That record already exists.', ...(fieldErrors.length ? { fieldErrors } : {}) }); }
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message });
}
function readableValidation(issue) {
  if (issue.code === 'invalid_type') return issue.expected === 'number' ? 'Enter a number.' : issue.expected === 'string' ? 'Enter text.' : `Expected ${issue.expected}.`;
  if (issue.code === 'too_small' && issue.minimum === 2) return 'Enter at least 2 characters.';
  if (issue.code === 'too_small' && issue.minimum === 1) return 'This field is required.';
  if (issue.code === 'too_big') return `Use no more than ${issue.maximum} ${typeof issue.maximum === 'number' ? 'characters or items' : 'characters'}.`;
  return issue.message;
}
function readableMongooseValidation(issue) {
  if (issue.kind === 'Number') return 'Enter a valid number.';
  if (issue.kind === 'String') return issue.path === 'slug' ? 'Use lowercase letters, numbers, and hyphens only.' : 'Enter valid text.';
  return issue.message || 'Check this value.';
}
module.exports = { authenticate, allow, errorHandler };
