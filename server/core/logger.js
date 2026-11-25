// Tiny request logger (method, path, status, ms). Kept dependency-free.
function logger(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
}

module.exports = logger;
