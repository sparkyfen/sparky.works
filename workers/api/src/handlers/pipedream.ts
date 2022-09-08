import moment from 'moment';
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
    if (!listWorkFlowsResult.ok) {
      return new Response(JSON.stringify({message: listWorkFlowsJson.error}), { status: listWorkFlowsResult.status, headers: {
        ...defaultHeaders,
        'Cache-Control': 'public, max-age=300'
      } });
    }
    const result = listWorkFlowsJson.data.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      created_on: workflow.created_at,
      modified_on: workflow.updated_at,
      version: workflow.version,
    }));
    return new Response(JSON.stringify(result), { headers: {
      ...defaultHeaders,
      'Cache-Control': 'public, max-age=300'
    } });
  },
  analytics: async (req: Request, env: Env, ctx: ExecutionContext) => {
    if (!req.params.id) {
      return new Response(JSON.stringify({message: 'Missing id.'}), { status: 400, headers: {
        ...defaultHeaders,
        'Cache-Control': 'public, max-age=300'
      } });
    }
    const params = {
      expand: 'event',
      exclude_tests: 'true',
      unique_trace: 'true',
    };
    const eventSummaryResult = await fetch(`https://api.pipedream.com/v1/sources/${req.params.id}/$trace/event_summaries?${new URLSearchParams(params)}`, {
      cf: {
        cacheTtlByStatus: { '200-299': 300, '404': 1, '500-599': 0 },
        cacheEverything: true,
      },
      headers: {
        'Authorization': `Bearer ${env.PIPEDREAM_API_TOKEN}`
      }
    });
    const eventSummaryJson = await eventSummaryResult.json();
    if (!eventSummaryResult.ok) {
      return new Response(JSON.stringify({message: eventSummaryJson.error}), { status: eventSummaryResult.status, headers: {
        ...defaultHeaders,
        'Cache-Control': 'public, max-age=300'
      } });
    }
    const result = {
      id: req.params.id,
      status: eventSummaryJson.data[0].event.state,
      last_run_on: moment(eventSummaryJson.data[0].indexed_at_ms).utc().format(),
      total_requests: eventSummaryJson.page_info.count,
      total_errors: eventSummaryJson.data.filter((summary) => summary.event.state === 'ERROR').length,
    };
    return new Response(JSON.stringify(result), { headers: {
      ...defaultHeaders,
      'Cache-Control': 'public, max-age=300'
    } });
  }
};

export default Pipedream;