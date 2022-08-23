import React from 'react';
import { Box, ColumnLayout, Container, Header, SpaceBetween, StatusIndicator } from '@cloudscape-design/components';
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
  return (
    <Container header={<Header variant="h2">{worker.id}</Header>}>
      <ColumnLayout columns={4} variant="text-grid">
        <SpaceBetween size="l">
          <ValueWithLabel label="Status">
            <StatusIndicator>{worker.status}</StatusIndicator>
          </ValueWithLabel>
        </SpaceBetween>
        <SpaceBetween size="l">
          <ValueWithLabel label="Created on">{worker.created_on}</ValueWithLabel>
          <ValueWithLabel label="Modified on">{worker.modified_on}</ValueWithLabel>
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