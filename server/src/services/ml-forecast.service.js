const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const { z } = require('zod');

const predictionItemSchema = z.object({
  timestamp: z.string().optional().nullable(),
  hourOfDay: z.number().int().optional().nullable(),
  dayOfWeek: z.number().int().optional().nullable(),
  predictedDemand: z.number().nonnegative(),
  confidence: z.number().min(0).max(1)
});

const mlResponseSchema = z.object({
  facilityId: z.string(),
  modelVersion: z.string(),
  predictions: z.array(predictionItemSchema)
});

class MLForecastService {
  constructor() {
    this.baseUrl = process.env.ML_FORECAST_URL || 'http://127.0.0.1:8000';
    this.timeoutMs = parseInt(process.env.ML_FORECAST_TIMEOUT_MS || '2500', 10);
  }

  /**
   * Dispatches feature vectors to Python ML prediction service with strict timeout and validation.
   * Never throws unhandled exceptions; returns a structured status object.
   */
  async requestMLPrediction({ facilityId, horizon, features }) {
    return new Promise((resolve) => {
      let isSettled = false;
      const safeResolve = (val) => {
        if (!isSettled) {
          isSettled = true;
          resolve(val);
        }
      };

      try {
        const urlStr = `${this.baseUrl.replace(/\/+$/, '')}/predict`;
        const parsedUrl = new URL(urlStr);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const payload = JSON.stringify({
          facilityId: String(facilityId),
          horizon: Number(horizon),
          features
        });

        const req = client.request(
          {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode < 200 || res.statusCode >= 300) {
                return safeResolve({
                  success: false,
                  reason: res.statusCode === 503 ? 'ML_MODEL_NOT_LOADED' : 'ML_SERVICE_ERROR',
                  error: `ML service returned HTTP ${res.statusCode}: ${data.slice(0, 200)}`
                });
              }

              try {
                const parsed = JSON.parse(data);
                const validated = mlResponseSchema.safeParse(parsed);
                if (!validated.success) {
                  return safeResolve({
                    success: false,
                    reason: 'MALFORMED_ML_RESPONSE',
                    error: validated.error.message
                  });
                }

                return safeResolve({
                  success: true,
                  modelVersion: validated.data.modelVersion,
                  predictions: validated.data.predictions
                });
              } catch (parseErr) {
                return safeResolve({
                  success: false,
                  reason: 'MALFORMED_ML_RESPONSE',
                  error: parseErr.message
                });
              }
            });
          }
        );

        req.setTimeout(this.timeoutMs, () => {
          req.destroy(new Error('ML_SERVICE_TIMEOUT'));
        });

        req.on('error', (err) => {
          const reason = err.message === 'ML_SERVICE_TIMEOUT'
            ? 'ML_SERVICE_TIMEOUT'
            : 'ML_SERVICE_UNAVAILABLE';
          safeResolve({
            success: false,
            reason,
            error: err.message
          });
        });

        req.write(payload);
        req.end();
      } catch (err) {
        safeResolve({
          success: false,
          reason: 'ML_REQUEST_CONFIG_ERROR',
          error: err.message
        });
      }
    });
  }
}

const mlForecastService = new MLForecastService();

module.exports = {
  MLForecastService,
  mlForecastService
};
