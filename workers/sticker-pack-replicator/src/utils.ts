const METHODS = 'POST, GET, OPTIONS';
exports.CORS_METHODS = METHODS;
const HEADERS = 'Content-Type';
exports.CORS_HEADERS = HEADERS;

exports.DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': METHODS,
  'Access-Control-Request-Headers': HEADERS,
};