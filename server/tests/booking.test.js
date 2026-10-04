const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePrice } = require('../src/utils/booking');

test('prices hourly reservations by rounded-up hours', () => {
  const result = calculatePrice({
    start: new Date('2028-01-01T09:00:00Z'),
    end: new Date('2028-01-01T10:15:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400
  });
  assert.deepEqual(result, { units: 2, amount: 120 });
});

test('prices daily reservations by rounded-up days', () => {
  const result = calculatePrice({
    start: new Date('2028-01-01T09:00:00Z'),
    end: new Date('2028-01-02T10:00:00Z'),
    type: 'DAILY',
    hourlyRate: 60,
    dailyRate: 400
  });
  assert.deepEqual(result, { units: 2, amount: 800 });
});

test('prices reservations using specific active pricing rules when available', () => {
  const rules = [
    {
      name: 'EV Special',
      spotType: 'EV',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      pricePerHour: 85,
      pricePerDay: 550,
      isActive: true
    }
  ];

  const resultEV = calculatePrice({
    start: new Date('2028-01-01T09:00:00Z'),
    end: new Date('2028-01-01T11:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    spotType: 'EV',
    rules
  });
  assert.deepEqual(resultEV, { units: 2, amount: 170 });

  const resultStandard = calculatePrice({
    start: new Date('2028-01-01T09:00:00Z'),
    end: new Date('2028-01-01T11:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    spotType: 'STANDARD',
    rules
  });
  assert.deepEqual(resultStandard, { units: 2, amount: 120 });
});

test('pricing: rule applies inside time window', () => {
  const rules = [
    {
      name: 'Morning Peak',
      spotType: 'ALL',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '09:00',
      endTime: '12:00',
      pricePerHour: 90,
      pricePerDay: 500,
      isActive: true
    }
  ];

  const result = calculatePrice({
    start: new Date('2028-01-01T09:30:00Z'),
    end: new Date('2028-01-01T11:30:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(result, { units: 2, amount: 180 });
});

test('pricing: rule does not apply outside time window', () => {
  const rules = [
    {
      name: 'Morning Peak',
      spotType: 'ALL',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '09:00',
      endTime: '12:00',
      pricePerHour: 90,
      pricePerDay: 500,
      isActive: true
    }
  ];

  const result = calculatePrice({
    start: new Date('2028-01-01T14:00:00Z'),
    end: new Date('2028-01-01T16:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(result, { units: 2, amount: 120 });
});

test('pricing: rule applies on matching day of week', () => {
  const rules = [
    {
      name: 'Weekday Discount',
      spotType: 'ALL',
      daysOfWeek: [1, 2, 3, 4, 5], // Monday through Friday
      startTime: '00:00',
      endTime: '23:59',
      pricePerHour: 45,
      pricePerDay: 250,
      isActive: true
    }
  ];

  // 2028-01-03 is Monday (UTC day 1)
  const result = calculatePrice({
    start: new Date('2028-01-03T10:00:00Z'),
    end: new Date('2028-01-03T12:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(result, { units: 2, amount: 90 });
});

test('pricing: rule does not apply on non-matching day of week', () => {
  const rules = [
    {
      name: 'Weekday Discount',
      spotType: 'ALL',
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '00:00',
      endTime: '23:59',
      pricePerHour: 45,
      pricePerDay: 250,
      isActive: true
    }
  ];

  // 2028-01-02 is Sunday (UTC day 0)
  const result = calculatePrice({
    start: new Date('2028-01-02T10:00:00Z'),
    end: new Date('2028-01-02T12:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(result, { units: 2, amount: 120 });
});

test('pricing: spot-type-specific pricing works', () => {
  const rules = [
    {
      name: 'Accessible Discount',
      spotType: 'ACCESSIBLE',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
      pricePerHour: 30,
      pricePerDay: 200,
      isActive: true
    }
  ];

  const resultAccessible = calculatePrice({
    start: new Date('2028-01-01T10:00:00Z'),
    end: new Date('2028-01-01T12:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    spotType: 'ACCESSIBLE',
    rules
  });
  assert.deepEqual(resultAccessible, { units: 2, amount: 60 });

  const resultStandard = calculatePrice({
    start: new Date('2028-01-01T10:00:00Z'),
    end: new Date('2028-01-01T12:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    spotType: 'STANDARD',
    rules
  });
  assert.deepEqual(resultStandard, { units: 2, amount: 120 });
});

test('pricing: more specific rule wins when multiple rules match', () => {
  const rules = [
    {
      name: 'General Weekday Rate',
      spotType: 'ALL',
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '00:00',
      endTime: '23:59',
      pricePerHour: 70,
      pricePerDay: 400,
      isActive: true
    },
    {
      name: 'EV Weekday All-Day',
      spotType: 'EV',
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '00:00',
      endTime: '23:59',
      pricePerHour: 85,
      pricePerDay: 500,
      isActive: true
    },
    {
      name: 'EV Morning Peak Surge',
      spotType: 'EV',
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '12:00',
      pricePerHour: 110,
      pricePerDay: 600,
      isActive: true
    }
  ];

  // Case 1: EV booking during Morning Peak (Rule 3 wins: specific spotType + day + time)
  const resultPeakEV = calculatePrice({
    start: new Date('2028-01-03T10:00:00Z'),
    end: new Date('2028-01-03T12:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 350,
    spotType: 'EV',
    rules
  });
  assert.deepEqual(resultPeakEV, { units: 2, amount: 220 });

  // Case 2: EV booking outside Peak (Rule 2 wins: specific spotType + day)
  const resultOffPeakEV = calculatePrice({
    start: new Date('2028-01-03T14:00:00Z'),
    end: new Date('2028-01-03T16:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 350,
    spotType: 'EV',
    rules
  });
  assert.deepEqual(resultOffPeakEV, { units: 2, amount: 170 });

  // Case 3: Standard spot during peak (Rule 1 wins: day-only match)
  const resultPeakStandard = calculatePrice({
    start: new Date('2028-01-03T10:00:00Z'),
    end: new Date('2028-01-03T12:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 350,
    spotType: 'STANDARD',
    rules
  });
  assert.deepEqual(resultPeakStandard, { units: 2, amount: 140 });

  // Case 4: Weekend standard booking (Baseline facility rate wins)
  const resultWeekendStandard = calculatePrice({
    start: new Date('2028-01-02T10:00:00Z'),
    end: new Date('2028-01-02T12:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 350,
    spotType: 'STANDARD',
    rules
  });
  assert.deepEqual(resultWeekendStandard, { units: 2, amount: 120 });
});

test('pricing: overnight window 22:00 to 02:00 matching', () => {
  const rules = [
    {
      name: 'Night Owl Rate',
      spotType: 'ALL',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '22:00',
      endTime: '02:00',
      pricePerHour: 35,
      pricePerDay: 200,
      isActive: true
    }
  ];

  // Booking spanning midnight: 23:00 to 01:00
  const resultMidnight = calculatePrice({
    start: new Date('2028-01-01T23:00:00Z'),
    end: new Date('2028-01-02T01:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(resultMidnight, { units: 2, amount: 70 });

  // Booking in evening portion: 22:30 to 23:30
  const resultEvening = calculatePrice({
    start: new Date('2028-01-01T22:30:00Z'),
    end: new Date('2028-01-01T23:30:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(resultEvening, { units: 1, amount: 35 });

  // Booking in early morning portion: 00:30 to 01:30
  const resultMorning = calculatePrice({
    start: new Date('2028-01-02T00:30:00Z'),
    end: new Date('2028-01-02T01:30:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(resultMorning, { units: 1, amount: 35 });

  // Booking outside overnight window: 14:00 to 16:00 (facility rate applies)
  const resultDaytime = calculatePrice({
    start: new Date('2028-01-01T14:00:00Z'),
    end: new Date('2028-01-01T16:00:00Z'),
    type: 'HOURLY',
    hourlyRate: 60,
    dailyRate: 400,
    rules
  });
  assert.deepEqual(resultDaytime, { units: 2, amount: 120 });
});
