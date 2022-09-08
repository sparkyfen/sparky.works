import { useEffect, useState } from 'react';
import AppLayout from '@cloudscape-design/components/app-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';

import {
  Worker as IWorker,
  WorkerDetail as IWorkerDetail,
  MergedWorkerDetails,
  Workflow as IWorkflow,
  MergedWorkflowDetails,
} from './types';
import WorkerDetail from './worker-detail';
import Workflow from './workflow';

const App = () => {
  const [workerDetails, setWorkerDetails] = useState<MergedWorkerDetails[]>([]);
  const [workflows, setWorkflows] = useState<MergedWorkflowDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_ENDPOINT}/workers`, {
      mode: 'cors',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((result) => {
      result.json().then((response) => {
        if (result.ok) {
          getWorkerAnalytics(response);
        } else {
          setLoading(false);
          console.error(response.message);
        }
      });
    }).catch((error) => {
      setLoading(false);
      console.error(error);
    });
    fetch(`${process.env.REACT_APP_API_ENDPOINT}/pipedream/workflows`, {
      mode: 'cors',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((result) => {
      result.json().then((response) => {
        if (result.ok) {
          getWorkflowAnalytics(response);
        } else {
          setLoading(false);
          console.error(response.message);
        }
      });
    })
  }, []);

  const getWorkflowAnalytics = async (workflows: IWorkflow[]) => {
    const workflowDetails = []
    for (const workflow of workflows) {
      const result = await fetch(`${process.env.REACT_APP_API_ENDPOINT}/pipedream/workflows/analytics/${workflow.id}`, {
        mode: 'cors',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const workflowAnalytics = await result.json();
      if (result.ok) {
        workflowDetails.push({
          ...workflow,
          ...workflowAnalytics
        });
      } else {
        console.error(workflowAnalytics.message);
      }
    }
    setWorkflows(workflowDetails);
  };

  const getWorkerAnalytics = (workers: IWorker[]) => {
    fetch(`${process.env.REACT_APP_API_ENDPOINT}/workers/analytics`, {
      mode: 'cors',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((result) => {
      result.json().then((workerAnalytics) => {
        if (result.ok) {
          setLoading(false);
          const mergedWorkerDetails = workerAnalytics.filter((workerAnalytic : IWorkerDetail) =>
            workers.findIndex((workerDetail : IWorker) => workerDetail.id === workerAnalytic.id) !== -1
          ).map((workerAnalytic : IWorkerDetail) => ({
            ...workers.find((workerDetail: IWorker) => workerDetail.id === workerAnalytic.id && workerDetail),
            ...workerAnalytic
          }));
          setWorkerDetails(mergedWorkerDetails);
        } else {
          setLoading(false);
          console.error(workerAnalytics.message);
        }
      });
    }).catch((error) => {
      setLoading(false);
      console.error(error);
    });
  };

  return (
    <AppLayout
      ariaLabels={{
        navigation: "Navigation drawer",
        navigationClose: "Close navigation drawer",
        navigationToggle: "Open navigation drawer",
        notifications: "Notifications",
        tools: "Help panel",
        toolsClose: "Close help panel",
        toolsToggle: "Open help panel"
      }}
      contentType="form"
      navigationHide={true}
      toolsHide={true}
      contentHeader={<Header variant='h1' description="24hr stats">Sparky's Workers!</Header>}
      content={
        <>
          {
            loading ? <Container><Spinner size="large" /></Container>
            : <SpaceBetween size='s'>
                {workerDetails.map((workerDetail, key) => {
                  return (
                    <WorkerDetail worker={workerDetail} key={key} />
                  );
                })}
                {workflows.map((workflow, key) => {
                  return (
                    <Workflow workflow={workflow} key={key} />
                  );
                })}
              </SpaceBetween>
          }
        </>
      }
    />
  );
}


export default App;
