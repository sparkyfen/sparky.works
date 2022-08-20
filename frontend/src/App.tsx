import { useEffect, useState } from 'react';
import AppLayout from '@cloudscape-design/components/app-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';

type Worker = {
  id: string;    
}
const App = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);

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
          setWorkers(response);
        } else {
          console.error(response.message);
        }
      });
    }).catch((error) => {
      console.error(error);
    });
  }, []);

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
      contentHeader={<Header variant='h1'>Sparky's Workers!</Header>}
      content={
        <Container
          header={
            <Header
              variant="h2"
              description="List of CloudFlare Workers Owned by @Sparky under this domain!"
            />
          }
        >
          <SpaceBetween size='s'>
            {workers.map((worker, key) => {
              return (
                <div key={key}>
                  <h2>{worker.id}</h2>
                </div>
              );
            })}
          </SpaceBetween>
        </Container>
      }
    />
  );
}


export default App;
