import { defaultHeaders } from '../utils';

const Workers = {
  list: async (req: Request, env: Env, ctx: ExecutionContext) => {
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
    if (!listWorkersJson.success) {
      return new Response(JSON.stringify({message: listWorkersJson.errors[0].message}), {
        status: 400,
        headers: {
          ...defaultHeaders,
        }
      });
    }
    const workerDetails = listWorkersJson.result
    .filter((worker) => !worker.routes)
    .map((worker) => ({
      id: worker.id,
      created_on: worker.created_on,
      modified_on: worker.modified_on
    }));
    return new Response(JSON.stringify(workerDetails), { headers: {
      ...defaultHeaders,
      'Cache-Control': 'public, max-age=300'
    } });
  },
  analytics: async (req: Request, env: Env, ctx: ExecutionContext) => {
    const body = JSON.stringify({
      /*
        cpuTimeP25: float32!
        CPU time 25th percentile - microseconds

        cpuTimeP50: float32!
        CPU time 50th percentile - microseconds

        cpuTimeP75: float32!
        CPU time 75th percentile - microseconds

        cpuTimeP90: float32!
        CPU time 90th percentile - microseconds

        cpuTimeP99: float32!
        CPU time 99th percentile - microseconds

        cpuTimeP999: float32!
        CPU time 99.9th percentile - microseconds
      */
      // TODO Add workersInvocationsScheduled to the query for the total list.
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
                environmentName
                namespaceName
              }
            }
          }
        }
      }`,
      variables: {
        accountTag: `${env.ACCOUNT_ID}`,
        datetimeStart: "2022-08-19T00:00:00Z", // TODO Change this to a longer time that we're allowed.
        datetimeEnd: new Date().toISOString(),
      }
    });
    const workerAnalyticsResult = await fetch(`https://api.cloudflare.com/client/v4/graphql`, {
      method: 'POST',
      cf: {
        cacheTtlByStatus: { '200-299': 300, '404': 1, '500-599': 0 },
        cacheEverything: true
      },
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Auth-Email': `${env.API_EMAIL}`,
        'Authorization': `Bearer ${env.API_TOKEN}`
      },
      body
    });
    const workerAnalyticsJson = await workerAnalyticsResult.json();
    if (workerAnalyticsJson.errors && workerAnalyticsJson.errors.length > 0) {
      const errorMessage = workerAnalyticsJson.errors[0].message;
      if (!errorMessage) {
        console.warn('Missing error message from CloudFlare', workerAnalyticsJson.errors[0]);
        return new Response(JSON.stringify({message: 'Invalid request'}), {status: 400, headers: defaultHeaders});
      }
      let status = 400;
      ['limit reached', 'quota exceeded'].forEach((sampleError) => {
        if (errorMessage.indexOf(sampleError) !== -1) {
          status = 429;
        }
      });
      return new Response(JSON.stringify({message: errorMessage}), {status, headers: defaultHeaders});
    }
    const workerAnalytics = workerAnalyticsJson.data.viewer.accounts[0].workersInvocationsAdaptive.map((workerData) => ({
      id: workerData.dimensions.scriptName,
      status: workerData.dimensions.status,
      total_requests: workerData.sum.requests,
      total_errors: workerData.sum.errors,
      environment: workerData.dimensions.environmentName,
      namespace: workerData.dimensions.namespaceName,
    }));
    return new Response(JSON.stringify(workerAnalytics), { headers: {
      ...defaultHeaders,
      'Cache-Control': 'public, max-age=300'
    } });
  }
};

export default Workers;