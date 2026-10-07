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
      accountType: 'OPERATOR',
      internalRole: 'ADMIN',
      role: 'ADMIN',
      organizationId: urbanPark._id
    },
    {
      name: 'UrbanPark Executive Owner',
      email: 'owner@urbanpark.test',
      passwordHash: devPasswordHash,
      accountType: 'OPERATOR',
      internalRole: 'OWNER',
      role: 'OWNER',
      organizationId: urbanPark._id
    },
    {
      name: 'UrbanPark Operations Admin',
      email: 'admin@urbanpark.test',
      passwordHash: devPasswordHash,
      accountType: 'OPERATOR',
      internalRole: 'ADMIN',
      role: 'ADMIN',
      organizationId: urbanPark._id
    },
    {
      name: 'UrbanPark Shift Manager',
      email: 'manager@urbanpark.test',
      passwordHash: devPasswordHash,
      accountType: 'OPERATOR',
      internalRole: 'MANAGER',
      role: 'MANAGER',
      organizationId: urbanPark._id
    },
    {
      name: 'Priya Shah',
      email: 'operator@parkspot.test',
      passwordHash: devPasswordHash,
      accountType: 'OPERATOR',
      internalRole: 'OPERATOR',
      role: 'OPERATOR',
      organizationId: urbanPark._id
    },
    {
      name: 'Priya Shah',
      email: 'operator@urbanpark.test',
      passwordHash: devPasswordHash,
      accountType: 'OPERATOR',
      internalRole: 'OPERATOR',
      role: 'OPERATOR',
      organizationId: urbanPark._id
    },
    {
      name: 'Rahul Verma (Driver)',
      email: 'user@parkspot.test',
      passwordHash: devPasswordHash,
      accountType: 'DRIVER',
      internalRole: null,
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

  // 3. Create Facilities (Parking Lots) with Real Geographic Coordinates
  const facilitiesData = [
    // Delhi & NCR Facilities
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
      latitude: 28.6315,
      longitude: 77.2167,
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
      latitude: 28.5677,
      longitude: 77.3259,
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
      latitude: 28.5494,
      longitude: 77.1212,
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
      latitude: 28.6290,
      longitude: 77.2285,
      organizationId: urbanPark._id
    },
    // Ahmedabad Facilities (Near Ahmedabad Airport & Riverfront)
    {
      name: 'Riverside Airport Parking',
      address: 'Airport Circle, Hansol',
      city: 'Ahmedabad',
      description: 'Covered premier airport parking with 24/7 security and shuttle transfer.',
      hourlyRate: 40,
      dailyRate: 280,
      openingTime: '00:00',
      closingTime: '23:59',
      active: true,
      latitude: 23.0765,
      longitude: 72.6240,
      organizationId: urbanPark._id
    },
    {
      name: 'Airport Terminal P1 Hub',
      address: 'Terminal 1 Approach Road, Hansol',
      city: 'Ahmedabad',
      description: 'Direct pedestrian access to departure gates with EV fast charging.',
      hourlyRate: 50,
      dailyRate: 350,
      openingTime: '00:00',
      closingTime: '23:59',
      active: true,
      latitude: 23.0715,
      longitude: 72.6285,
      organizationId: urbanPark._id
    },
    {
      name: 'Riverfront Promenade Deck',
      address: 'West Riverfront Road, Navrangpura',
      city: 'Ahmedabad',
      description: 'Spacious waterfront parking with park connectivity and automated boom barriers.',
      hourlyRate: 30,
      dailyRate: 200,
      openingTime: '06:00',
      closingTime: '23:00',
      active: true,
      latitude: 23.0375,
      longitude: 72.5714,
      organizationId: urbanPark._id
    },
    // Vadodara Facilities (Near Railway Station, Sayajigunj, Parul University & Manjalpur)
    {
      name: 'Sayajigunj Station Plaza',
      address: 'Station Road, Sayajigunj',
      city: 'Vadodara',
      description: 'Adjacent to Vadodara Central Junction with express digital check-in.',
      hourlyRate: 35,
      dailyRate: 240,
      openingTime: '00:00',
      closingTime: '23:59',
      active: true,
      latitude: 22.3120,
      longitude: 73.1830,
      organizationId: urbanPark._id
    },
    {
      name: 'Alkapuri Commercial Hub',
      address: 'RC Dutt Road, Alkapuri',
      city: 'Vadodara',
      description: 'Multi-level corporate park with dedicated EV charging and accessible bays.',
      hourlyRate: 45,
      dailyRate: 300,
      openingTime: '07:00',
      closingTime: '23:30',
      active: true,
      latitude: 22.3142,
      longitude: 73.1740,
      organizationId: urbanPark._id
    },
    {
      name: 'Parul University Parking',
      address: 'Parul University Gate 1, Limda, Waghodia',
      city: 'Vadodara',
      description: 'Designated campus parking for students, faculty and visitors.',
      hourlyRate: 20,
      dailyRate: 120,
      openingTime: '07:00',
      closingTime: '22:00',
      active: true,
      latitude: 22.2895,
      longitude: 73.3648,
      organizationId: urbanPark._id
    },
    {
      name: 'Waghodia Crossroad Mobility Lot',
      address: 'Waghodia Main Road, Limda',
      city: 'Vadodara',
      description: 'Convenient transit parking serving Waghodia corridor and Parul institutes.',
      hourlyRate: 25,
      dailyRate: 150,
      openingTime: '06:00',
      closingTime: '23:00',
      active: true,
      latitude: 22.2980,
      longitude: 73.3520,
      organizationId: urbanPark._id
    },
    {
      name: 'Manjalpur Sports Complex Bay',
      address: 'Darbar Ring Road, Manjalpur',
      city: 'Vadodara',
      description: 'Secure open & covered bays adjacent to sports complex and residential zone.',
      hourlyRate: 30,
      dailyRate: 180,
      openingTime: '05:30',
      closingTime: '23:00',
      active: true,
      latitude: 22.2698,
      longitude: 73.1955,
      organizationId: urbanPark._id
    }
  ];

  // Cleanup any legacy malformed location objects before upserting
  try {
    await ParkingLot.collection.updateMany(
      { 'location.coordinates': { $exists: false } },
      { $unset: { location: '' } }
    );
  } catch (cleanErr) {
    // Ignore if collection doesn't exist yet
  }

  const seededFacilities = [];
  for (const facData of facilitiesData) {
    if (typeof facData.latitude === 'number' && typeof facData.longitude === 'number') {
      facData.location = {
        type: 'Point',
        coordinates: [facData.longitude, facData.latitude]
      };
    }
    const facility = await ParkingLot.findOneAndUpdate(
      { name: facData.name, city: facData.city },
      facData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    seededFacilities.push(facility);

    // 4. Create Multi-Floor Architecture per Facility (3 Floors x 16 Spots = 48 Spaces)
    const floorsData = [
      { name: 'Ground Floor', floorNumber: 0, capacity: 16 },
      { name: 'Level 1', floorNumber: 1, capacity: 16 },
      { name: 'Level 2', floorNumber: 2, capacity: 16 }
    ];

    for (const fData of floorsData) {
      const floor = await Floor.findOneAndUpdate(
        { facilityId: facility._id, floorNumber: fData.floorNumber },
        { ...fData, facilityId: facility._id, organizationId: urbanPark._id },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // 5. Create Parking Spots with Spatial Coordinates
      const existingSlots = await ParkingSlot.find({ lotId: facility._id, floorId: floor._id }).lean();
      const existingNumbers = new Set(existingSlots.map((s) => s.number));
      const slotsToInsert = [];

      for (let i = 1; i <= fData.capacity; i++) {
        const slotNum = `${floor.floorNumber === 0 ? 'G' : `L${floor.floorNumber}`}-${String(i).padStart(2, '0')}`;
        if (!existingNumbers.has(slotNum)) {
          const type = i % 6 === 0 ? 'EV' : i % 9 === 0 ? 'ACCESSIBLE' : i % 4 === 0 ? 'COMPACT' : 'STANDARD';

          // Realistic operational distribution across each floor:
          // - Parked cars (OCCUPIED): slots 2, 5, 7, 11
          // - Active reservations (RESERVED): slots 4, 9, 14
          // - Maintenance inspection (MAINTENANCE): slot 12
          // - Open bays ready for driver reservation (AVAILABLE): slots 1, 3, 6, 8, 10, 13, 15, 16
          let slotStatus = 'AVAILABLE';
          if (i === 2 || i === 5 || i === 7 || i === 11) {
            slotStatus = 'OCCUPIED';
          } else if (i === 4 || i === 9 || i === 14) {
            slotStatus = 'RESERVED';
          } else if (i === 12) {
            slotStatus = 'MAINTENANCE';
          }

          slotsToInsert.push({
            lotId: facility._id,
            floorId: floor._id,
            organizationId: urbanPark._id,
            number: slotNum,
            level: floor.name,
            type,
            status: slotStatus,
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
      }
      if (slotsToInsert.length > 0) {
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
    // 9. Assign Operators to Specific Parking Facilities (ONE OPERATOR = ONE FACILITY)
    const parulFacility = seededFacilities.find((f) => f.name === 'Parul University Parking') || firstFacility;
    if (parulFacility) {
      await User.updateMany(
        { email: { $in: ['operator@parkspot.test', 'operator@urbanpark.test'] } },
        { facilityId: parulFacility._id, name: 'Priya Shah' }
      );
      await ParkingLot.findByIdAndUpdate(parulFacility._id, {
        operatorId: createdUsers['operator@parkspot.test']?._id || createdUsers['operator@urbanpark.test']?._id
      });

      // Ensure Parul facility has a confirmed booking for driver & operator view
      const parulSlot = await ParkingSlot.findOne({ lotId: parulFacility._id, isActive: true });
      if (parulSlot) {
        const pNow = new Date();
        await Booking.findOneAndUpdate(
          { slotId: parulSlot._id, status: 'CONFIRMED' },
          {
            userId: driverUser._id,
            lotId: parulFacility._id,
            slotId: parulSlot._id,
            floorId: parulSlot.floorId,
            vehicleId: sampleVehicle._id,
            organizationId: urbanPark._id,
            startTime: new Date(pNow.getTime() - 30 * 60000),
            endTime: new Date(pNow.getTime() + 2.5 * 3600000),
            type: 'HOURLY',
            status: 'CONFIRMED',
            totalAmount: 60
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }
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
