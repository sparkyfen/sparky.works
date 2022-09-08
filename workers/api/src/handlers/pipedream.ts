import { defaultHeaders } from '../utils';

const Pipedream = {
  workflows: async (req: Request, env: Env, ctx: ExecutionContext) => {
    const listWorkFlowsResult = await fetch(`https://api.pipedream.com/v1/users/me/workflows`, {
      cf: {
        cacheTtlByStatus: { '200-299': 300, '404': 1, '500-599': 0 },
        cacheEverything: true
      },
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${env.PIPEDREAM_API_TOKEN}`
      }
    });
    const listWorkFlowsJson = await listWorkFlowsResult.json();
    const result = listWorkFlowsJson.data.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      created_on: workflow.created_at,
      modified_on: workflow.updated_at,
      version: workflow.version
    }));
    return new Response(JSON.stringify(result), { headers: {
      ...defaultHeaders,
      'Cache-Control': 'public, max-age=300'
    } });
  }
};

export default Pipedream;