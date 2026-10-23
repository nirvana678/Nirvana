require('dotenv').config();
process.env.TZ = process.env.TZ || 'Africa/Nairobi';
const mongoose = require('mongoose');
const app = require('./app');
const port = Number(process.env.PORT || 4000);
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) { console.error('Set MONGODB_URI and JWT_SECRET before starting the API.'); process.exit(1); }
mongoose.connect(process.env.MONGODB_URI).then(() => { app.listen(port, '0.0.0.0', () => console.log(`Nirvana API listening on port ${port}`)); }).catch((error) => { console.error('Could not connect to MongoDB:', error.message); process.exit(1); });
