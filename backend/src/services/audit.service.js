const { AuditLog } = require('../models');
const { AppError } = require('../errors');

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'keySecret', 'providerSignature'];
  for (const k of sensitiveKeys) {
    delete clone[k];
  }
  return clone;
}

async function logAction({
  organizationId = null,
  userId = null,
  action,
  entityType,
  entityId,
  oldValue = null,
  newValue = null,
  ipAddress = null
}) {
  try {
    return await AuditLog.create({
      organizationId,
      userId,
      action,
      entityType,
      entityId: String(entityId),
      oldValue: sanitize(oldValue),
      newValue: sanitize(newValue),
      ipAddress,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('AuditLog Error:', error.message);
    return null;
  }
}

async function getAuditLogs({
  organizationId,
  startDate = null,
  endDate = null,
  action = null,
  entityType = null,
  userId = null,
  entityId = null,
  page = 1,
  limit = 20
}) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }

  const query = { organizationId };

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!Number.isNaN(start.getTime())) {
        query.timestamp.$gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime())) {
        query.timestamp.$lte = end;
      }
    }
  }

  if (action) query.action = action;
  if (entityType) query.entityType = entityType;
  if (userId) query.userId = userId;
  if (entityId) query.entityId = String(entityId);

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(query),
    AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean()
  ]);

  return {
    auditLogs: logs.map((log) => ({
      ...log,
      id: String(log._id),
      oldValue: sanitize(log.oldValue),
      newValue: sanitize(log.newValue)
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
}

module.exports = { logAction, getAuditLogs, sanitize };
