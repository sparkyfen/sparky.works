import { Router } from 'itty-router';
import Cors from './handlers/cors';
import SmsHandler from './handlers/sms';
import { defaultHeaders } from './utils';

const router = Router();

const errorHandler = (error) => {
	console.error(error.message);
  return new Response(JSON.stringify({message: error.message}) || 'Internal server error.', { status: error.status || 500, headers: defaultHeaders});
};

router.options('*', Cors)
router.post('/api/sms', SmsHandler.webhook)
router.all('*', () => new Response(JSON.stringify({message: 'Not Found.'}), { status: 404, headers: defaultHeaders }));

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		return router.handle(request, env, ctx)
    .catch(errorHandler);
	},
};
