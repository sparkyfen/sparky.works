import { Router } from 'itty-router';

const router = Router();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const json = JSON.stringify({message: 'Hello world!'});
    router
      .get('*', () => new Response(json, {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Access-Control-Allow-Origin': 'https://sparky.works',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      }));
    return router.handle(request);
  },
};