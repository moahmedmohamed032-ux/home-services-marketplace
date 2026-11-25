const ApiError = require('../core/ApiError');
const config = require('../core/config');

// Final error renderer: consistent JSON shape for every failure.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err instanceof ApiError ? err.status : 500;
  const body = {
    error: {
      message: err instanceof ApiError ? err.message : 'Internal server error',
      ...(err.details ? { details: err.details } : {}),
      ...(!config.isProduction && status === 500 ? { stack: err.stack } : {}),
    },
  };
  if (status === 500) console.error(err);
  res.status(status).json(body);
}

module.exports = errorHandler;
