const { z } = require('zod');
const forecastingService = require('../services/forecasting.service');

const demandForecastQuerySchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  horizon: z.coerce.number().int().min(1).max(168).optional(),
  granularity: z.enum(['hour', 'day']).optional().default('hour')
});

async function getDemandForecast(req, res, next) {
  try {
    const query = demandForecastQuerySchema.parse(req.query);
    const result = await forecastingService.getFacilityDemandForecast({
      organizationId: req.user.organizationId,
      facilityId: query.facilityId,
      startDate: query.startDate,
      endDate: query.endDate,
      horizon: query.horizon,
      granularity: query.granularity,
      userId: req.user.sub,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDemandForecast
};
