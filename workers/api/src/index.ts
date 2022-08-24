import { Router } from 'itty-router';

import Workers from './handlers/workers';
import Cors from './handlers/cors';
import { defaultHeaders } from './utils';

const router = Router();

const errorHandler = (error) => {
  return new Response(error.message || 'Internal server error.', { status: error.status || 500, headers: defaultHeaders});
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const json = JSON.stringify({message: 'Hello world!'});
    router
      .options('/api/workers', Cors)
      .options('/api/workers/analytics', Cors)
      .options('*', Cors)
      .get('/api/workers', Workers.list)
      .get('/api/workers/analytics', Workers.analytics)
      .get('*', () => new Response(json, {
        headers: defaultHeaders,
      }));
    return router.handle(request, env, ctx)
    .catch(errorHandler);
  },
};