import { defaultHeaders } from '../utils';

const Workers = async (req: Request, env: Env, ctx: ExecutionContext) => {
  const listWorkersResult = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/workers/scripts`, {
    cf: {
      cacheTtlByStatus: { '200-299': 300, '404': 1, '500-599': 0 },
      cacheEverything: true
    },
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Authorization': `Bearer ${env.API_TOKEN}`
    }
  });
  const listWorkersJson = await listWorkersResult.json();
  const workerDetails = listWorkersJson.result
  .filter((worker) => !worker.routes)
  .map((worker) => ({
    id: worker.id,
    created_on: worker.created_on,
    modified_on: worker.modified_on
  }));
  const body = JSON.stringify({
    query: `query GetWorkersAnalytics($accountTag: string, $datetimeStart: string, $datetimeEnd: string) {
      viewer {
        accounts(filter: {accountTag: $accountTag}) {
          workersInvocationsAdaptive(limit: 1000, filter: {
            datetime_geq: $datetimeStart,
            datetime_leq: $datetimeEnd
          }) {
            sum {
              requests
              errors
            }
            dimensions{
              scriptName
              status
            }
          }
        }
      }
    }`,
    variables: {
      accountTag: `${env.ACCOUNT_ID}`,
      datetimeStart: "2022-08-19T08:00:00Z", // TODO Change this to a longer time that we're allowed.
      datetimeEnd: "2022-08-20T08:30:00Z"
    }
  });
  const workerAnalyticsResult = await fetch(`https://api.cloudflare.com/client/v4/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Auth-Email': `${env.API_EMAIL}`,
      'Authorization': `Bearer ${env.API_TOKEN}`
    },
    body
  });
  const workerAnalyticsJson = await workerAnalyticsResult.json();
  // TODO Merge workerAnalyticsJson & workerDetails with the details we want.
  return new Response(JSON.stringify(workerDetails), { headers: {
    ...defaultHeaders,
    'Cache-Control': 'public, max-age=300'
  } });
};

export default Workers;