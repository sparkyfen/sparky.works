import React from 'react';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import moment from 'moment';

import { MergedWorkerDetails } from './types';

const ValueWithLabel = ({ label, children }: {label: string, children: React.ReactElement | any}) => (
  <div>
    <Box variant="awsui-key-label">{label}</Box>
    <div>{children}</div>
  </div>
);

type WorkerDetailProps = {
  worker: MergedWorkerDetails;
  key: number;
}
const WorkerDetail = (props: WorkerDetailProps) => {
  const { worker } = props;
  let statusType: StatusIndicatorProps.Type = 'in-progress';
  switch(worker.status) {
    case 'success':
      statusType = 'success';
      break;
    // TODO There might be more here but we can't see cause CloudFlare GraphQL API doesn't ENUM this field.
    default:
      break;
  }
  return (
    <Container header={<Header variant="h2">{worker.id}</Header>}>
      <ColumnLayout columns={4} variant="text-grid">
        <SpaceBetween size="l">
          <ValueWithLabel label="Status">
            <StatusIndicator iconAriaLabel={worker.status} type={statusType}>{worker.status}</StatusIndicator>
          </ValueWithLabel>
        </SpaceBetween>
        <SpaceBetween size="l">
          <ValueWithLabel label="Created on">{moment(worker.created_on).utc().fromNow()}</ValueWithLabel>
          <ValueWithLabel label="Modified on">{moment(worker.modified_on).utc().fromNow()}</ValueWithLabel>
        </SpaceBetween>
        <SpaceBetween size="l">
          <ValueWithLabel label="Namespace">
            {worker.namespace || '-'}
          </ValueWithLabel>
          <ValueWithLabel label="Environment">
            {worker.environment}
          </ValueWithLabel>
        </SpaceBetween>
        <SpaceBetween size="l">
            <ValueWithLabel label="Total Request">
              {worker.total_requests}
            </ValueWithLabel>
            <ValueWithLabel label="Total Errors">
              {worker.total_errors}
            </ValueWithLabel>
        </SpaceBetween>
      </ColumnLayout>
    </Container>
  );
};

export default WorkerDetail;