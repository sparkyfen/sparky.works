const METHODS = 'POST, GET, OPTIONS';
exports.METHODS = METHODS;
const HEADERS = 'Content-Type';
exports.HEADERS = HEADERS;

exports.defaultHeaders = {
  'Content-Type': 'application/json;charset=UTF-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': METHODS,
  'Access-Control-Request-Headers': HEADERS,
};