const { z } = require('zod');
const { OptimizationRecommendation, ParkingLot } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('../services/audit.service');
const aiContextService = require('../services/ai-context.service');
const llmService = require('../services/llm.service');

const insightsSchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i),
  question: z.string().trim().min(3).max(500),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

async function getInsights(req, res, next) {
  try {
    const data = insightsSchema.parse(req.body);
    const orgId = req.user.organizationId;

    // Verify facility ownership
    const facilityExists = await ParkingLot.exists({
      _id: data.facilityId,
      organizationId: orgId
    });
    if (!facilityExists) {
      throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
    }

    // Build bounded structured context
    const context = await aiContextService.buildFacilityOperationsContext({
      organizationId: orgId,
      facilityId: data.facilityId,
      startDate: data.startDate,
      endDate: data.endDate
    });

    // Request LLM operations synthesis
    const insight = await llmService.generateOperationsInsight({
      question: data.question,
      context
    });

    // Audit logging
    await logAction({
      organizationId: orgId,
      userId: req.user.sub,
      action: 'AI_INSIGHT_REQUESTED',
      entityType: 'ParkingLot',
      entityId: data.facilityId,
      newValue: {
        questionSummary: data.question.slice(0, 100),
        disclaimer: insight.disclaimer
      },
      ipAddress: req.ip
    });

    res.json(insight);
  } catch (error) {
    next(error);
  }
}

async function explainRecommendation(req, res, next) {
  try {
    const orgId = req.user.organizationId;
    const recommendationId = req.params.id;

    const recommendation = await OptimizationRecommendation.findOne({
      _id: recommendationId,
      organizationId: orgId
    }).lean();

    if (!recommendation) {
      throw new AppError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found in your organization.');
    }

    const context = await aiContextService.buildFacilityOperationsContext({
      organizationId: orgId,
      facilityId: recommendation.facilityId
    });

    const explanation = await llmService.explainOptimizationRecommendation({
      recommendation,
      context
    });

    await logAction({
      organizationId: orgId,
      userId: req.user.sub,
      action: 'AI_RECOMMENDATION_EXPLAINED',
      entityType: 'OptimizationRecommendation',
      entityId: recommendationId,
      newValue: {
        recommendationType: recommendation.type,
        title: recommendation.title
      },
      ipAddress: req.ip
    });

    res.json(explanation);
  } catch (error) {
    next(error);
  }
}

const copilotService = require('../services/copilot.service');

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system', 'model']),
      content: z.string().trim().min(1).max(4000)
    })
  ).min(1).optional(),
  message: z.string().trim().min(1).max(4000).optional(),
  history: z.array(z.any()).optional(),
  facilityId: z.string().optional().nullable()
}).refine(data => !!(data.messages || data.message), {
  message: "Either 'messages' array or 'message' string is required"
});

async function chatCopilot(req, res, next) {
  try {
    const data = chatSchema.parse(req.body);
    const orgId = req.user.organizationId;
    const resolvedFacilityId = req.facilityId || req.user.facilityId || data.facilityId;

    let messages = data.messages;
    if (!messages && data.message) {
      const history = Array.isArray(data.history) ? data.history.map((h) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h.content || '')
      })) : [];
      messages = [...history, { role: 'user', content: data.message }];
    }

    console.log(`[CopilotController] Incoming chat query (${messages.length} turns) from operator ${req.user.sub}, facility: ${resolvedFacilityId}`);

    const result = await copilotService.processCopilotChat({
      organizationId: orgId,
      userId: req.user.sub,
      messages,
      facilityId: resolvedFacilityId,
      user: req.user
    });

    res.json(result);
  } catch (error) {
    console.error('[CopilotController] Copilot error:', error);
    if (error.code === 'COPILOT_LLM_ERROR' || error.name === 'AppError') {
      return res.status(error.statusCode || 502).json({
        success: false,
        error: error.code || 'COPILOT_LLM_ERROR',
        message: error.message
      });
    }
    next(error);
  }
}

module.exports = {
  getInsights,
  explainRecommendation,
  chatCopilot
};
