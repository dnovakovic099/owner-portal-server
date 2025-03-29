/**
 * Centralized error handling for the server
 */

// Custom API error class
class ApiError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_SERVER_ERROR', data = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.data = data;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Common error types
const ErrorTypes = {
  BAD_REQUEST: (message, data) => new ApiError(
    message || 'Bad request', 
    400, 
    'BAD_REQUEST', 
    data
  ),
  
  UNAUTHORIZED: (message, data) => new ApiError(
    message || 'Unauthorized access', 
    401, 
    'UNAUTHORIZED', 
    data
  ),
  
  FORBIDDEN: (message, data) => new ApiError(
    message || 'Access forbidden', 
    403, 
    'FORBIDDEN', 
    data
  ),
  
  NOT_FOUND: (message, data) => new ApiError(
    message || 'Resource not found', 
    404, 
    'NOT_FOUND', 
    data
  ),
  
  CONFLICT: (message, data) => new ApiError(
    message || 'Resource conflict', 
    409, 
    'CONFLICT', 
    data
  ),
  
  VALIDATION_ERROR: (message, data) => new ApiError(
    message || 'Validation error', 
    422, 
    'VALIDATION_ERROR', 
    data
  ),
  
  TOO_MANY_REQUESTS: (message, data) => new ApiError(
    message || 'Too many requests', 
    429, 
    'TOO_MANY_REQUESTS', 
    data
  ),
  
  INTERNAL_ERROR: (message, data) => new ApiError(
    message || 'Internal server error', 
    500, 
    'INTERNAL_SERVER_ERROR', 
    data
  ),
  
  SERVICE_UNAVAILABLE: (message, data) => new ApiError(
    message || 'Service unavailable', 
    503, 
    'SERVICE_UNAVAILABLE', 
    data
  ),
  
  TIMEOUT: (message, data) => new ApiError(
    message || 'Request timeout', 
    504, 
    'TIMEOUT', 
    data
  )
};

/**
 * Express error handling middleware
 */
const errorMiddleware = (err, req, res, next) => {
  // Log the error
  console.error('Server error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    status: err.status || 500,
    code: err.code
  });
  
  // Default to 500 if status is not set
  const statusCode = err.status || 500;
  
  // Send error response
  res.status(statusCode).json({
    error: {
      message: err.message || 'An unexpected error occurred',
      code: err.code || 'INTERNAL_SERVER_ERROR',
      // Only include details in development
      details: process.env.NODE_ENV === 'development' ? err.data : undefined,
      // Include request path in development
      path: process.env.NODE_ENV === 'development' ? req.path : undefined
    }
  });
};

/**
 * Async handler to catch errors in async route handlers
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  ApiError,
  ErrorTypes,
  errorMiddleware,
  asyncHandler
};