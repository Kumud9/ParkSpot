const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { ParkingLot } = require('../src/models');
const { listPublicFacilities } = require('../src/services/facility.service');

test('search: city query handles regex metacharacters safely without ReDoS or syntax errors', async () => {
  await connectDatabase();

  const testLot = await ParkingLot.create({
    name: 'Special City Lot',
    address: '10 Special Way',
    city: 'Delhi [North]',
    hourlyRate: 50,
    dailyRate: 350
  });

  // Test 1: Literal search with brackets and symbols
  const resultsWithBrackets = await listPublicFacilities({ city: 'Delhi [North]' });
  assert.ok(
    resultsWithBrackets.some((lot) => lot.city === 'Delhi [North]'),
    'Should find lot matching literal city with brackets'
  );

  // Test 2: Catastrophic backtracking pattern that would hang vulnerable RegExp
  const startTime = Date.now();
  const dangerousPattern = '((((((a+)+)+)+)+)+)+$';
  const emptyResults = await listPublicFacilities({ city: dangerousPattern });
  const duration = Date.now() - startTime;

  assert.ok(duration < 500, `ReDoS search pattern took ${duration}ms, should resolve in <500ms`);
  assert.equal(emptyResults.length, 0, 'No lot should match non-existent malicious pattern');

  // Test 3: Common regex metacharacters .*+?^${}()|[]\
  const specialChars = '.*+?^${}()|[]\\';
  const specialResults = await listPublicFacilities({ city: specialChars });
  assert.equal(specialResults.length, 0, 'Metacharacters should be treated as literal text, not regex operators');

  // Cleanup
  await ParkingLot.deleteOne({ _id: testLot._id });
});
