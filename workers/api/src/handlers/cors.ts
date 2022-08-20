// Yoinked from https://github.com/kwhitley/itty-router-extras/discussions/16
import { ORIGIN, METHODS, HEADERS } from '../utils';

const Cors = async (req: Request, env: Env, ctx: ExecutionContext) => {
  const reqHeaders = req.headers;
  if (reqHeaders.get('Origin') !== null && reqHeaders.get('Access-Control-Request-Method') !== null) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': reqHeaders.get('Origin'),
      'Access-Control-Allow-Methods': METHODS,
      'Access-Control-Allow-Headers': HEADERS,
      'Access-Control-Allow-Credentials': 'true'
    };
    return new Response(null, {status: 204, headers: corsHeaders});
  }
  return new Response(null, {headers: {'Allow': METHODS}})
};
export default Cors;