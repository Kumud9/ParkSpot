const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const {
  User,
  Organization,
  ParkingLot,
  Floor,
  ParkingSlot,
  Vehicle,
  PricingRule,
  Booking,
  OccupancyEvent,
  AuditLog
} = require('../src/models');

async function seed() {
  await connectDatabase();
  console.log('Seeding ParkSpot B2B database...');

  // 1. Create B2B Organization: UrbanPark Solutions
  const urbanPark = await Organization.findOneAndUpdate(
    { slug: 'urbanpark-solutions' },
    {
      name: 'UrbanPark Solutions',
      slug: 'urbanpark-solutions',
      email: 'operations@urbanpark.test',
      phone: '+91-11-23456789',
      address: 'Plot 42, Connaught Place Outer Circle',
      city: 'Delhi',
      status: 'ACTIVE'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Organization created/updated: ${urbanPark.name} (${urbanPark._id})`);

  // 2. Create B2B Roles & Users
  const devPasswordHash = await bcrypt.hash('Pass@12345', 12);
  const legacyAdminPasswordHash = await bcrypt.hash('Admin@123', 12);

  const users = [
    {
      name: 'ParkSpot Legacy Admin',
      email: 'admin@parkspot.local',
      passwordHash: legacyAdminPasswordHash,
      role: 'ADMIN',
      organizationId: urbanPark._id
    },
    {
      name: 'UrbanPark Executive Owner',
      email: 'owner@urbanpark.test',
      passwordHash: devPasswordHash,
      role: 'OWNER',
      organizationId: urbanPark._id
    },
    {
      name: 'UrbanPark Operations Admin',
      email: 'admin@urbanpark.test',
      passwordHash: devPasswordHash,
      role: 'ADMIN',
      organizationId: urbanPark._id
    },
    {
      name: 'UrbanPark Shift Manager',
      email: 'manager@urbanpark.test',
      passwordHash: devPasswordHash,
      role: 'MANAGER',
      organizationId: urbanPark._id
    },
    {
      name: 'UrbanPark Operations Staff',
      email: 'operator@urbanpark.test',
      passwordHash: devPasswordHash,
      role: 'OPERATOR',
      organizationId: urbanPark._id
    },
    {
      name: 'Priya Sharma (Driver)',
      email: 'user@parkspot.test',
      passwordHash: devPasswordHash,
      role: 'USER',
      organizationId: null
    }
  ];

  const createdUsers = {};
  for (const u of users) {
    const userDoc = await User.findOneAndUpdate(
      { email: u.email },
      u,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    createdUsers[u.email] = userDoc;
  }
  console.log(`Seeded ${Object.keys(createdUsers).length} users with B2B & consumer roles.`);

  // 3. Create Facilities (Parking Lots)
  const facilitiesData = [
    {
      name: 'Central Business District Parking',
      address: '14 Connaught Place',
      city: 'Delhi',
      description: 'Prime underground automated parking facility in central commercial district.',
      hourlyRate: 60,
      dailyRate: 420,
      openingTime: '00:00',
      closingTime: '23:59',
      active: true,
      organizationId: urbanPark._id
    },
    {
      name: 'City Mall Parking',
      address: 'Sector 38A, Noida',
      city: 'Noida',
      description: 'Multi-level shopping center parking with fast-charging EV bays and valet.',
      hourlyRate: 50,
      dailyRate: 360,
      openingTime: '09:00',
      closingTime: '23:00',
      active: true,
      organizationId: urbanPark._id
    },
    {
      name: 'Airport Express Lot',
      address: 'Aerocity Access Road',
      city: 'Delhi',
      description: 'Long-stay monitored parking adjacent to airport express transit terminal.',
      hourlyRate: 70,
      dailyRate: 500,
      openingTime: '00:00',
      closingTime: '23:59',
      active: true,
      organizationId: urbanPark._id
    },
    {
      name: 'Metro Central Garage',
      address: 'Barakhamba Road Metro Terminal',
      city: 'Delhi',
      description: 'Multi-story transit interchange parking with direct metro walkway.',
      hourlyRate: 40,
      dailyRate: 300,
      openingTime: '05:00',
      closingTime: '00:00',
      active: true,
      organizationId: urbanPark._id
    }
  ];

  const seededFacilities = [];
  for (const facData of facilitiesData) {
    const facility = await ParkingLot.findOneAndUpdate(
      { name: facData.name, city: facData.city },
      facData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    seededFacilities.push(facility);

    // 4. Create Multi-Floor Architecture per Facility
    const floorsData = [
      { name: 'Ground Floor', floorNumber: 0, capacity: 12 },
      { name: 'Level 1', floorNumber: 1, capacity: 12 },
      { name: 'Level 2', floorNumber: 2, capacity: 12 }
    ];

    for (const fData of floorsData) {
      const floor = await Floor.findOneAndUpdate(
        { facilityId: facility._id, floorNumber: fData.floorNumber },
        { ...fData, facilityId: facility._id, organizationId: urbanPark._id },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // 5. Create Parking Spots with Spatial Coordinates
      const existingSlots = await ParkingSlot.countDocuments({ lotId: facility._id, floorId: floor._id });
      if (existingSlots === 0) {
        const slotsToInsert = [];
        for (let i = 1; i <= fData.capacity; i++) {
          const slotNum = `${floor.floorNumber === 0 ? 'G' : `L${floor.floorNumber}`}-${String(i).padStart(2, '0')}`;
          const type = i % 6 === 0 ? 'EV' : i % 9 === 0 ? 'ACCESSIBLE' : i % 4 === 0 ? 'COMPACT' : 'STANDARD';

          slotsToInsert.push({
            lotId: facility._id,
            floorId: floor._id,
            organizationId: urbanPark._id,
            number: slotNum,
            level: floor.name,
            type,
            status: 'AVAILABLE',
            isActive: true,
            coordinates: {
              x: (i % 6) * 3.0,
              y: Math.floor(i / 6) * 6.0,
              width: 2.5,
              height: 5.0,
              rotation: 0
            }
          });
        }
        await ParkingSlot.insertMany(slotsToInsert);
      }
    }

    // 6. Create Configurable Pricing Rules
    await PricingRule.findOneAndUpdate(
      { facilityId: facility._id, name: 'EV Supercharger Special' },
      {
        facilityId: facility._id,
        organizationId: urbanPark._id,
        name: 'EV Supercharger Special',
        spotType: 'EV',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: '00:00',
        endTime: '23:59',
        pricePerHour: facility.hourlyRate + 25,
        pricePerDay: facility.dailyRate + 150,
        isActive: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`Seeded ${seededFacilities.length} facilities with multi-floor layouts and pricing rules.`);

  // 7. Seed Sample Vehicle for Customer
  const driverUser = createdUsers['user@parkspot.test'];
  const sampleVehicle = await Vehicle.findOneAndUpdate(
    { userId: driverUser._id, registrationNumber: 'DL01AB1234' },
    {
      userId: driverUser._id,
      registrationNumber: 'DL01AB1234',
      vehicleType: 'CAR',
      make: 'Tata',
      model: 'Nexon EV'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Vehicle registered: ${sampleVehicle.registrationNumber}`);

  // 8. Seed Sample Bookings & Occupancy Events
  const firstFacility = seededFacilities[0];
  const firstSlot = await ParkingSlot.findOne({ lotId: firstFacility._id, isActive: true });

  if (firstSlot) {
    const now = new Date();
    // Active upcoming reservation
    const upcomingStart = new Date(now.getTime() + 2 * 3600000);
    const upcomingEnd = new Date(now.getTime() + 5 * 3600000);

    const booking = await Booking.findOneAndUpdate(
      { userId: driverUser._id, slotId: firstSlot._id, status: 'CONFIRMED' },
      {
        userId: driverUser._id,
        lotId: firstFacility._id,
        slotId: firstSlot._id,
        floorId: firstSlot.floorId,
        vehicleId: sampleVehicle._id,
        organizationId: urbanPark._id,
        startTime: upcomingStart,
        endTime: upcomingEnd,
        type: 'HOURLY',
        status: 'CONFIRMED',
        totalAmount: 180
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Record Occupancy Event
    await OccupancyEvent.create({
      organizationId: urbanPark._id,
      facilityId: firstFacility._id,
      floorId: firstSlot.floorId,
      spotId: firstSlot._id,
      eventType: 'BOOKING_CREATED',
      source: 'BOOKING',
      bookingId: booking._id,
      metadata: { seeded: true }
    });

    // Record Audit Log
    await AuditLog.create({
      organizationId: urbanPark._id,
      userId: createdUsers['admin@urbanpark.test']._id,
      action: 'FACILITY_CREATED',
      entityType: 'ParkingLot',
      entityId: String(firstFacility._id),
      newValue: { name: firstFacility.name }
    });
  }

  console.log('Seed completed successfully with B2B hierarchy.');
}

seed()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error('Seed failure:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
