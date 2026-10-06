class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function errorHandler(error, _req, res, _next) {
  if (error.name === 'ZodError') {
    const flattened = typeof error.flatten === 'function' ? error.flatten() : null;
    let message = 'One or more fields are invalid.';
    if (flattened?.fieldErrors) {
      const parts = [];
      if (flattened.fieldErrors.email) {
        parts.push('Please enter a valid email address (e.g. name@example.com)');
      }
      if (flattened.fieldErrors.password) {
        parts.push('Password must be at least 8 characters');
      }
      if (flattened.fieldErrors.name) {
        parts.push('Full name must be at least 2 characters');
      }
      if (parts.length === 0) {
        const custom = Object.entries(flattened.fieldErrors)
          .map(([k, v]) => `${k}: ${v.join(', ')}`)
          .join(', ');
        if (custom) parts.push(custom);
      }
      if (parts.length > 0) {
        message = parts.join('. ') + '.';
      }
    }
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message, details: flattened } });
  }
  if (error.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE_RECORD', message: 'An account with this email already exists. Please sign in instead.' } });
  }
  if (error instanceof AppError) {
    if (error.code === 'SPOT_ALREADY_BOOKED') {
      return res.status(error.status).json({
        error: 'SPOT_ALREADY_BOOKED',
        code: 'SPOT_ALREADY_BOOKED',
        message: error.message,
        details: error.details
      });
    }
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
      code: error.code,
      message: error.message,
      details: error.details
    });
  }
  console.error(error);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
}

module.exports = { AppError, errorHandler };
