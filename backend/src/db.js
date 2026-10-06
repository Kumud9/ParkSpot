const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const mongoose = require('mongoose');

// Windows / ISP routers often drop or refuse DNS SRV queries (querySrv ECONNREFUSED).
// Setting reliable DNS servers fixes this permanently for MongoDB Atlas mongodb+srv URIs.
function configureDnsForSrv() {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch (err) {
    // Graceful fallback if environment restricts dns.setServers
  }
}

// Preemptively configure public DNS if connecting to an SRV cluster
const rawUri = process.env.MONGODB_URI || '';
if (rawUri.startsWith('mongodb+srv://')) {
  configureDnsForSrv();
}

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/parkspot';

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch (error) {
    const isSrvDnsError = error && (error.code === 'ECONNREFUSED' || error.syscall === 'querySrv');
    if (isSrvDnsError) {
      console.warn('[DB] SRV DNS resolution failed with default DNS. Retrying with Google/Cloudflare DNS (8.8.8.8, 1.1.1.1)...');
      configureDnsForSrv();
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    } else {
      throw error;
    }
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log(`Connected to MongoDB: ${mongoose.connection.name}`);
  }
}

module.exports = { connectDatabase };

