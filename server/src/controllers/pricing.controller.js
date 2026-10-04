const { z } = require('zod');
const pricingService = require('../services/pricing.service');

const ruleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  spotType: z.enum(['ALL', 'STANDARD', 'COMPACT', 'EV', 'ACCESSIBLE']).default('ALL'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('00:00'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('23:59'),
  pricePerHour: z.coerce.number().positive(),
  pricePerDay: z.coerce.number().positive(),
  isActive: z.boolean().optional()
});

async function listRules(req, res, next) {
  try {
    const rules = await pricingService.listPricingRules(
      req.params.facilityId,
      req.user.organizationId
    );
    res.json({ rules });
  } catch (error) {
    next(error);
  }
}

async function createRule(req, res, next) {
  try {
    const data = ruleSchema.parse(req.body);
    const rule = await pricingService.createPricingRule(
      req.params.facilityId,
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
}

async function updateRule(req, res, next) {
  try {
    const data = ruleSchema.partial().parse(req.body);
    const rule = await pricingService.updatePricingRule(
      req.params.id,
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.json({ rule });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRules,
  createRule,
  updateRule
};
