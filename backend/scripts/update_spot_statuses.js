const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
require('dotenv').config();

async function updateSpots() {
  try {
    await connectDatabase();


    const db = mongoose.connection.db;
    const slotsCollection = db.collection('parkingslots');

    const allSlots = await slotsCollection.find({}).toArray();
    console.log(`[ParkSpot] Found ${allSlots.length} total parking slots across facilities.`);

    let occupiedCount = 0;
    let reservedCount = 0;
    let maintCount = 0;
    let availableCount = 0;

    for (const slot of allSlots) {
      // Extract numeric suffix from spot number (e.g. 'G-02' -> 2, 'L1-05' -> 5, 'A3' -> 3)
      const match = slot.number.match(/\d+$/);
      const num = match ? parseInt(match[0], 10) : 1;

      let status = 'AVAILABLE';
      if (num === 2 || num === 5 || num === 7 || num === 11) {
        status = 'OCCUPIED';
        occupiedCount++;
      } else if (num === 4 || num === 9) {
        status = 'RESERVED';
        reservedCount++;
      } else if (num === 12) {
        status = 'MAINTENANCE';
        maintCount++;
      } else {
        status = 'AVAILABLE';
        availableCount++;
      }

      await slotsCollection.updateOne(
        { _id: slot._id },
        { $set: { status, available: status === 'AVAILABLE' } }
      );
    }

    console.log(`[ParkSpot] Successfully updated spots:
    - OCCUPIED (Parked Cars): ${occupiedCount}
    - RESERVED (Warning stripes): ${reservedCount}
    - MAINTENANCE (Under inspection): ${maintCount}
    - AVAILABLE (Open for reservation): ${availableCount}`);

    // Update facilities slot count caches if any
    const lotsCollection = db.collection('parkinglots');
    const lots = await lotsCollection.find({}).toArray();
    for (const lot of lots) {
      const lotSlots = await slotsCollection.find({ lotId: lot._id }).toArray();
      const avail = lotSlots.filter(s => s.status === 'AVAILABLE').length;
      await lotsCollection.updateOne(
        { _id: lot._id },
        { $set: { availableSlots: avail, totalSlots: lotSlots.length } }
      );
    }

    console.log('[ParkSpot] All facility slot counts refreshed.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[ParkSpot] Update failed:', err);
    process.exit(1);
  }
}

updateSpots();
