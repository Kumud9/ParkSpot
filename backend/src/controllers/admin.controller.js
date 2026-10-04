const mongoose = require('mongoose');
const { z } = require('zod');
const { User, ParkingLot, ParkingSlot, Booking } = require('../models');
const { AppError } = require('../errors');
const auditService = require('../services/audit.service');

function getTenantOrgId(req) {
  if (!req.user || !req.user.organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required for admin operations.');
  }
  const orgId = req.user.organizationId;
  return typeof orgId === 'string' ? new mongoose.Types.ObjectId(orgId) : orgId;
}

async function getOverview(req, res, next) {
  try {
    const orgId = getTenantOrgId(req);
    const orgFilter = { organizationId: orgId };

    const [users, lots, slots, activeBookings, revenue] = await Promise.all([
      User.countDocuments({ role: 'USER', ...orgFilter }),
      ParkingLot.countDocuments({ active: true, ...orgFilter }),
      ParkingSlot.countDocuments({ isActive: true, ...orgFilter }),
      Booking.countDocuments({ status: 'CONFIRMED', ...orgFilter }),
      Booking.aggregate([
        { $match: { status: { $in: ['CONFIRMED', 'COMPLETED'] }, ...orgFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    res.json({
      overview: {
        users,
        lots,
        slots,
        activeBookings,
        revenue: revenue[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const orgId = getTenantOrgId(req);
    const orgFilter = { organizationId: orgId };

    const users = await User.aggregate([
      { $match: orgFilter },
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'userId',
          as: 'bookings'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          role: 1,
          organizationId: 1,
          status: 1,
          createdAt: 1,
          bookingCount: { $size: '$bookings' }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json({
      users: users.map((user) => ({
        ...user,
        id: String(user._id),
        _count: { bookings: user.bookingCount }
      }))
    });
  } catch (error) {
    next(error);
  }
}

async function getReports(req, res, next) {
  try {
    const orgId = getTenantOrgId(req);

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      throw new AppError(400, 'INVALID_DATE_RANGE', 'Provide a valid report date range.');
    }

    const results = await Booking.aggregate([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: from, $lte: to }
        }
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                bookings: { $sum: 1 },
                revenue: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'CANCELED'] }, 0, '$totalAmount']
                  }
                }
              }
            }
          ],
          bookings: [
            { $sort: { createdAt: -1 } },
            { $limit: 1000 },
            {
              $lookup: {
                from: 'parkinglots',
                localField: 'lotId',
                foreignField: '_id',
                as: 'lotDoc'
              }
            },
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'userDoc'
              }
            },
            {
              $lookup: {
                from: 'parkingslots',
                localField: 'slotId',
                foreignField: '_id',
                as: 'slotDoc'
              }
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                lotId: 1,
                slotId: 1,
                floorId: 1,
                vehicleId: 1,
                organizationId: 1,
                startTime: 1,
                endTime: 1,
                type: 1,
                status: 1,
                totalAmount: 1,
                createdAt: 1,
                updatedAt: 1,
                lotName: { $arrayElemAt: ['$lotDoc.name', 0] },
                userName: { $arrayElemAt: ['$userDoc.name', 0] },
                userEmail: { $arrayElemAt: ['$userDoc.email', 0] },
                slotNumber: { $arrayElemAt: ['$slotDoc.number', 0] }
              }
            }
          ]
        }
      }
    ]);

    const totalsData = results[0]?.totals[0] || { bookings: 0, revenue: 0 };
    const bookingsData = results[0]?.bookings || [];

    res.json({
      period: { from, to },
      totals: {
        bookings: totalsData.bookings,
        revenue: totalsData.revenue
      },
      bookings: bookingsData.map((b) => ({
        id: String(b._id),
        _id: b._id,
        userId: b.userId,
        lotId: b.lotId,
        slotId: b.slotId,
        floorId: b.floorId,
        vehicleId: b.vehicleId,
        organizationId: b.organizationId,
        startTime: b.startTime,
        endTime: b.endTime,
        type: b.type,
        status: b.status,
        totalAmount: b.totalAmount,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        lot: b.lotName || null,
        user: {
          name: b.userName || null,
          email: b.userEmail || null
        },
        slot: b.slotNumber || null
      }))
    });
  } catch (error) {
    next(error);
  }
}

const auditLogQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.string().optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

async function getAuditLogs(req, res, next) {
  try {
    const orgId = getTenantOrgId(req);
    const query = auditLogQuerySchema.parse(req.query);
    const result = await auditService.getAuditLogs({
      organizationId: orgId,
      ...query
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview,
  getUsers,
  getReports,
  getAuditLogs
};
