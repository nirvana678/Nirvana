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
  if (err.name === 'ZodError') return res.status(400).json({ error: err.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' · ') });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'That record already exists.' });
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message });
}
module.exports = { authenticate, allow, errorHandler };
