export const INITIAL_FACILITIES = [
  {
    id: 'fac-1',
    name: 'Metro Center Grand Terminal',
    address: '100 Connaught Place, Central Wing',
    city: 'New Delhi',
    distance: '0.4 km away',
    openStatus: 'Open 24/7',
    openingHours: '24 Hours',
    rating: 4.8,
    reviewsCount: 342,
    hourlyRate: 40,
    dailyRate: 320,
    totalSpots: 48,
    availableSpots: 18,
    occupiedSpots: 24,
    reservedSpots: 4,
    maintenanceSpots: 2,
    type: 'Multi-level Indoor Garage'
  },
  {
    id: 'fac-2',
    name: 'Cyber City Expressway Plaza',
    address: 'DLF Phase 2, Sector 24',
    city: 'Gurugram',
    distance: '2.1 km away',
    openStatus: 'Open · Closes 11:00 PM',
    openingHours: '06:00 AM – 11:00 PM',
    rating: 4.6,
    reviewsCount: 198,
    hourlyRate: 60,
    dailyRate: 450,
    totalSpots: 36,
    availableSpots: 11,
    occupiedSpots: 21,
    reservedSpots: 3,
    maintenanceSpots: 1,
    type: 'Commercial Tech Park'
  },
  {
    id: 'fac-3',
    name: 'Aerocity Express Terminal 3',
    address: 'Hospitality District, IGI Airport',
    city: 'New Delhi',
    distance: '5.6 km away',
    openStatus: 'Open 24/7',
    openingHours: '24 Hours',
    rating: 4.9,
    reviewsCount: 520,
    hourlyRate: 80,
    dailyRate: 600,
    totalSpots: 64,
    availableSpots: 28,
    occupiedSpots: 30,
    reservedSpots: 5,
    maintenanceSpots: 1,
    type: 'Airport Premium Parking'
  }
];

export function generateFloorSpots(facilityId, floorName) {
  const prefix = floorName.includes('1') ? 'A' : floorName.includes('2') ? 'B' : 'C';
  const spots = [];
  const rows = ['A', 'B', 'C', 'D'];

  rows.forEach((r) => {
    for (let i = 1; i <= 6; i++) {
      const spotNum = `${r}${i}`;
      let status = 'AVAILABLE';

      // Seed realistic occupied / reserved patterns
      if ((r === 'A' && (i === 1 || i === 3 || i === 4)) ||
          (r === 'B' && (i === 2 || i === 5)) ||
          (r === 'C' && (i === 1 || i === 2 || i === 6)) ||
          (r === 'D' && (i === 3 || i === 4))) {
        status = 'OCCUPIED';
      } else if (r === 'B' && i === 4) {
        status = 'RESERVED';
      } else if (r === 'D' && i === 6) {
        status = 'MAINTENANCE';
      }

      spots.push({
        id: `${facilityId}-${floorName}-${spotNum}`,
        number: spotNum,
        floor: floorName,
        type: spotNum === 'A1' || spotNum === 'A2' ? 'EV' : spotNum === 'D1' ? 'ACCESSIBLE' : 'STANDARD',
        status,
        rate: 40
      });
    }
  });

  return spots;
}

export const INITIAL_BOOKINGS = [
  {
    id: 'BK-8921',
    facilityName: 'Metro Center Grand Terminal',
    facilityAddress: '100 Connaught Place, Central Wing',
    floor: 'Floor 1',
    spotNumber: 'B4',
    startTime: 'Today, 02:00 PM',
    endTime: 'Today, 05:00 PM',
    duration: '3 hours',
    status: 'CONFIRMED',
    amount: 120,
    qrCode: 'PARK-BK8921-B4-CONFIRMED',
    vehiclePlate: 'DL 01 AB 4920'
  },
  {
    id: 'BK-7814',
    facilityName: 'Cyber City Expressway Plaza',
    facilityAddress: 'DLF Phase 2, Sector 24',
    floor: 'Floor 2',
    spotNumber: 'A3',
    startTime: 'Tomorrow, 09:00 AM',
    endTime: 'Tomorrow, 06:00 PM',
    duration: '9 hours',
    status: 'CONFIRMED',
    amount: 450,
    qrCode: 'PARK-BK7814-A3-CONFIRMED',
    vehiclePlate: 'HR 26 DQ 8812'
  },
  {
    id: 'BK-6190',
    facilityName: 'Aerocity Express Terminal 3',
    facilityAddress: 'Hospitality District, IGI Airport',
    floor: 'Floor 1',
    spotNumber: 'C2',
    startTime: 'Oct 01, 10:00 AM',
    endTime: 'Oct 01, 01:00 PM',
    duration: '3 hours',
    status: 'COMPLETED',
    amount: 240,
    qrCode: 'PARK-BK6190-C2-COMPLETED',
    vehiclePlate: 'DL 01 AB 4920'
  }
];

export const INITIAL_EVENTS = [
  {
    id: 'EVT-101',
    timestamp: 'Just now (15:42:10)',
    type: 'SPOT_OCCUPIED',
    spotNumber: 'B2',
    floor: 'Floor 1',
    source: 'Operational Check-in Event',
    occupancyRecorded: true
  },
  {
    id: 'EVT-102',
    timestamp: '3 mins ago (15:39:05)',
    type: 'SPOT_VACATED',
    spotNumber: 'A5',
    floor: 'Floor 1',
    source: 'Departure Event Recorded',
    occupancyRecorded: false
  },
  {
    id: 'EVT-103',
    timestamp: '12 mins ago (15:30:00)',
    type: 'SPOT_RESERVED',
    spotNumber: 'B4',
    floor: 'Floor 1',
    source: 'Driver Mobile App (User #492)',
    vehicleDetected: false
  },
  {
    id: 'EVT-104',
    timestamp: '28 mins ago (15:14:22)',
    type: 'OVERSTAY_ALERT',
    spotNumber: 'C1',
    floor: 'Floor 1',
    source: 'Automated Lifecycle Worker',
    details: 'Exceeded reservation by 24 mins'
  }
];

export const INITIAL_AUDIT_LOGS = [
  {
    id: 'AUD-901',
    timestamp: '2026-10-04 15:30:12',
    action: 'BOOKING_CONFIRMED',
    entity: 'Booking #BK-8921',
    user: 'driver_rahul@parkspot.in',
    source: 'Payment Gateway (Razorpay)',
    status: 'SUCCESS'
  },
  {
    id: 'AUD-902',
    timestamp: '2026-10-04 15:15:00',
    action: 'PRICING_RULE_APPLIED',
    entity: 'PricingRule #SURGE-PEAK',
    user: 'system_optimizer',
    source: 'Algorithmic Pricing Engine v3.0',
    status: 'SUCCESS'
  },
  {
    id: 'AUD-903',
    timestamp: '2026-10-04 14:48:33',
    action: 'SPOT_MAINTENANCE_TOGGLED',
    entity: 'ParkingSlot #D6',
    user: 'operator_amit@parkspot.in',
    source: 'B2B Admin Console',
    status: 'SUCCESS'
  },
  {
    id: 'AUD-904',
    timestamp: '2026-10-04 14:20:10',
    action: 'FORECAST_GENERATED',
    entity: 'Facility #MetroCenter',
    user: 'manager_kapoor@parkspot.in',
    source: 'Gradient Boosting ML Service',
    status: 'SUCCESS'
  }
];
