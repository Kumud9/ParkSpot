const { connectDatabase } = require('../src/db');
const { ParkingLot, PricingRule, Booking, ParkingSlot } = require('../src/models');
const mongoose = require('mongoose');

async function repair() {
  await connectDatabase();
  console.log('[Migration] Starting facility pricing and booking repair...');

  // 1. Find facilities with invalid or missing rates
  const facilities = await ParkingLot.find({
    $or: [
      { hourlyRate: { $lte: 0 } },
      { hourlyRate: null },
      { hourlyRate: { $exists: false } },
      { dailyRate: { $lte: 0 } },
      { dailyRate: null },
      { dailyRate: { $exists: false } }
    ]
  });

  console.log(`[Migration] Found ${facilities.length} facilities needing rate repair.`);

  for (const fac of facilities) {
    const oldHourly = fac.hourlyRate;
    const oldDaily = fac.dailyRate;
    const repairedHourly = Math.max(1, Number(fac.hourlyRate) > 0 ? Number(fac.hourlyRate) : (Number(fac.dailyRate) > 0 ? Math.round(fac.dailyRate / 6) : 50));
    const repairedDaily = Math.max(1, Number(fac.dailyRate) > 0 ? Number(fac.dailyRate) : Math.round(repairedHourly * 6));

    fac.hourlyRate = repairedHourly;
    fac.dailyRate = repairedDaily;
    await fac.save();

    console.log(`[Migration] Repaired facility "${fac.name}" (${fac._id}): hourlyRate ${oldHourly} -> ${repairedHourly}, dailyRate ${oldDaily} -> ${repairedDaily}`);

    // Create baseline pricing rules if missing
    const existingRules = await PricingRule.find({ facilityId: fac._id });
    if (existingRules.length === 0) {
      await PricingRule.create([
        {
          facilityId: fac._id,
          organizationId: fac.organizationId || null,
          name: 'Base Facility Rate',
          spotType: 'ALL',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startTime: '00:00',
          endTime: '23:59',
          pricePerHour: repairedHourly,
          pricePerDay: repairedDaily,
          isActive: true
        },
        {
          facilityId: fac._id,
          organizationId: fac.organizationId || null,
          name: 'EV Supercharger Special',
          spotType: 'EV',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startTime: '00:00',
          endTime: '23:59',
          pricePerHour: repairedHourly + 25,
          pricePerDay: repairedDaily + 150,
          isActive: true
        }
      ]);
      console.log(`[Migration] Initialized baseline pricing rules for "${fac.name}" (${fac._id}).`);
    }
  }

  // 2. Also ensure ALL existing facilities have baseline pricing rules
  const allFacilities = await ParkingLot.find({});
  for (const fac of allFacilities) {
    const rulesCount = await PricingRule.countDocuments({ facilityId: fac._id });
    if (rulesCount === 0) {
      const baseHourly = Math.max(1, Number(fac.hourlyRate) || 50);
      const baseDaily = Math.max(1, Number(fac.dailyRate) || Math.round(baseHourly * 6));
      await PricingRule.create([
        {
          facilityId: fac._id,
          organizationId: fac.organizationId || null,
          name: 'Base Facility Rate',
          spotType: 'ALL',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startTime: '00:00',
          endTime: '23:59',
          pricePerHour: baseHourly,
          pricePerDay: baseDaily,
          isActive: true
        },
        {
          facilityId: fac._id,
          organizationId: fac.organizationId || null,
          name: 'EV Supercharger Special',
          spotType: 'EV',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startTime: '00:00',
          endTime: '23:59',
          pricePerHour: baseHourly + 25,
          pricePerDay: baseDaily + 150,
          isActive: true
        }
      ]);
      console.log(`[Migration] Added missing baseline rules for facility "${fac.name}" (${fac._id}).`);
    }
  }

  // 3. Repair existing bookings that had totalAmount <= 0
  const invalidBookings = await Booking.find({
    $or: [
      { totalAmount: { $lte: 0 } },
      { totalAmount: null }
    ]
  });
  console.log(`[Migration] Found ${invalidBookings.length} bookings with invalid totalAmount.`);

  for (const bkg of invalidBookings) {
    const lot = await ParkingLot.findById(bkg.lotId);
    const hourly = lot && lot.hourlyRate > 0 ? lot.hourlyRate : 50;
    const durationHours = Math.max(1, Math.ceil((new Date(bkg.endTime) - new Date(bkg.startTime)) / 3600000));
    bkg.totalAmount = durationHours * hourly;
    await bkg.save();
    console.log(`[Migration] Repaired booking ${bkg._id}: totalAmount updated to ₹${bkg.totalAmount} (${durationHours}h @ ₹${hourly}/h).`);
  }

  console.log('[Migration] Database migration completed successfully.');
  await mongoose.disconnect();
}

if (require.main === module) {
  repair().catch((err) => {
    console.error('[Migration] Failed:', err);
    process.exit(1);
  });
}

module.exports = { repair };
