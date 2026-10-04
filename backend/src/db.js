const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const mongoose = require('mongoose');

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/parkspot';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  if (process.env.NODE_ENV !== 'test') {
    console.log(`Connected to MongoDB: ${mongoose.connection.name}`);
  }
}

module.exports = { connectDatabase };
