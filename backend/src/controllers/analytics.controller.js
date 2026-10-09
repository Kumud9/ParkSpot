const { z } = require('zod');
const analyticsService = require('../services/analytics.service');

const dateRangeSchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

const utilizationQuerySchema = dateRangeSchema.extend({
  floorId: z.string().regex(/^[a-f\d]{24}$/i).optional()
});

const occupancyTrendsSchema = dateRangeSchema.extend({
  bucket: z.enum(['hourly', 'daily']).optional().default('hourly')
});

const facilityAnalyticsSchema = dateRangeSchema.extend({});

const spotPerformanceSchema = dateRangeSchema.extend({
  floorId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

async function getSummary(req, res, next) {
  try {
    const query = dateRangeSchema.parse(req.query);
    const result = await analyticsService.getDashboardSummary({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId || (req.user?.role === 'OPERATOR' ? req.facilityId : null),
      startDate: query.startDate,
      endDate: query.endDate
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getUtilization(req, res, next) {
  try {
    const query = utilizationQuerySchema.parse(req.query);
    const result = await analyticsService.getUtilizationAnalytics({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId,
      floorId: query.floorId,
      startDate: query.startDate,
      endDate: query.endDate
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getOccupancy(req, res, next) {
  try {
    const query = occupancyTrendsSchema.parse(req.query);
    const result = await analyticsService.getOccupancyTrends({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId,
      startDate: query.startDate,
      endDate: query.endDate,
      bucket: query.bucket
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getPeakHours(req, res, next) {
  try {
    const query = facilityAnalyticsSchema.parse(req.query);
    const result = await analyticsService.getPeakHoursAnalytics({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId,
      startDate: query.startDate,
      endDate: query.endDate
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getRevenue(req, res, next) {
  try {
    const query = facilityAnalyticsSchema.parse(req.query);
    const result = await analyticsService.getRevenueAnalytics({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId,
      startDate: query.startDate,
      endDate: query.endDate
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getFacilities(req, res, next) {
  try {
    const query = dateRangeSchema.parse(req.query);
    const result = await analyticsService.getFacilityPerformance({
      organizationId: req.user.organizationId,
      startDate: query.startDate,
      endDate: query.endDate
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getSpots(req, res, next) {
  try {
    const query = spotPerformanceSchema.parse(req.query);
    const result = await analyticsService.getSpotPerformance({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId,
      floorId: query.floorId,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSummary,
  getUtilization,
  getOccupancy,
  getPeakHours,
  getRevenue,
  getFacilities,
  getSpots
};
