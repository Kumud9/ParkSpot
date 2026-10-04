const { PricingRule, ParkingLot } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');

async function listPricingRules(facilityId, organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const lotExists = await ParkingLot.exists({ _id: facilityId, organizationId });
  if (!lotExists) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const rules = await PricingRule.find({ facilityId, organizationId }).sort({ createdAt: -1 }).lean();
  return rules.map((r) => ({ ...r, id: String(r._id) }));
}

async function getPricingRuleById(ruleId, organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const rule = await PricingRule.findOne({ _id: ruleId, organizationId }).lean();
  if (!rule) {
    throw new AppError(404, 'RULE_NOT_FOUND', 'Pricing rule not found in your organization.');
  }
  return { ...rule, id: String(rule._id) };
}

async function createPricingRule(facilityId, organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const lotExists = await ParkingLot.exists({ _id: facilityId, organizationId });
  if (!lotExists) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const rule = await PricingRule.create({
    ...data,
    facilityId,
    organizationId
  });

  await logAction({
    organizationId,
    userId,
    action: 'PRICE_UPDATED',
    entityType: 'PricingRule',
    entityId: rule._id,
    newValue: rule.toObject(),
    ipAddress
  });

  return { ...rule.toObject(), id: String(rule._id) };
}

async function updatePricingRule(ruleId, organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const rule = await PricingRule.findOne({ _id: ruleId, organizationId });
  if (!rule) {
    throw new AppError(404, 'RULE_NOT_FOUND', 'Pricing rule not found in your organization.');
  }

  const oldObject = rule.toObject();
  const updated = await PricingRule.findOneAndUpdate({ _id: ruleId, organizationId }, data, { new: true });

  await logAction({
    organizationId,
    userId,
    action: 'PRICE_UPDATED',
    entityType: 'PricingRule',
    entityId: ruleId,
    oldValue: oldObject,
    newValue: updated.toObject(),
    ipAddress
  });

  return { ...updated.toObject(), id: String(updated._id) };
}

module.exports = {
  listPricingRules,
  getPricingRuleById,
  createPricingRule,
  updatePricingRule
};
