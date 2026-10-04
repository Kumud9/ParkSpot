const { z } = require('zod');
const optimizationService = require('../services/optimization.service');

const simulatePricingSchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i),
  floorId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  proposedPriceChangePct: z.number().optional().nullable(),
  proposedHourlyRate: z.number().positive().optional().nullable(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  priceElasticity: z.number().optional()
}).refine(
  (data) => data.proposedPriceChangePct !== undefined || data.proposedHourlyRate !== undefined,
  { message: 'Either proposedPriceChangePct or proposedHourlyRate is required.' }
);

const listRecommendationsSchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  type: z.enum(['PRICING_SURGE', 'PRICING_DISCOUNT', 'CAPACITY_REALLOCATION', 'OVERSTAY_ALERT', 'GENERAL']).optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const generateRecommendationsSchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  thresholds: z.object({
    highUtilizationThreshold: z.number().min(0).max(100).optional(),
    lowUtilizationThreshold: z.number().min(0).max(100).optional(),
    surgePriceIncreasePct: z.number().optional(),
    discountPriceDecreasePct: z.number().optional(),
    minBookingCountForSignal: z.number().optional()
  }).optional()
});

const rejectRecommendationSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

const overstaysQuerySchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['ACTIVE_OVERSTAY', 'RESOLVED_OVERSTAY', 'MISSING_DEPARTURE_EVENT', 'NO_OVERSTAY']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

async function listRecommendations(req, res, next) {
  try {
    const query = listRecommendationsSchema.parse(req.query);
    const result = await optimizationService.listRecommendations({
      organizationId: req.user.organizationId,
      ...query
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function generateRecommendations(req, res, next) {
  try {
    const data = generateRecommendationsSchema.parse(req.body);
    const result = await optimizationService.generateDemandRecommendations({
      organizationId: req.user.organizationId,
      facilityId: data.facilityId,
      startDate: data.startDate,
      endDate: data.endDate,
      thresholds: data.thresholds,
      userId: req.user.sub,
      ipAddress: req.ip
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function acceptRecommendation(req, res, next) {
  try {
    const result = await optimizationService.acceptRecommendation({
      organizationId: req.user.organizationId,
      recommendationId: req.params.id,
      userId: req.user.sub,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function rejectRecommendation(req, res, next) {
  try {
    const body = rejectRecommendationSchema.parse(req.body || {});
    const result = await optimizationService.rejectRecommendation({
      organizationId: req.user.organizationId,
      recommendationId: req.params.id,
      userId: req.user.sub,
      reason: body.reason,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function simulatePricing(req, res, next) {
  try {
    const data = simulatePricingSchema.parse(req.body);
    const result = await optimizationService.simulatePricingChange({
      organizationId: req.user.organizationId,
      facilityId: data.facilityId,
      floorId: data.floorId,
      proposedPriceChangePct: data.proposedPriceChangePct,
      proposedHourlyRate: data.proposedHourlyRate,
      startDate: data.startDate,
      endDate: data.endDate,
      priceElasticity: data.priceElasticity
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getOverstays(req, res, next) {
  try {
    const query = overstaysQuerySchema.parse(req.query);
    const result = await optimizationService.detectOverstays({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId,
      startDate: query.startDate,
      endDate: query.endDate,
      statusFilter: query.status,
      page: query.page,
      limit: query.limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRecommendations,
  generateRecommendations,
  acceptRecommendation,
  rejectRecommendation,
  simulatePricing,
  getOverstays
};
