import React from 'react';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import moment from 'moment';
import pipedreamLogo from './pd_logo.jpg';

import { MergedWorkflowDetails } from './types';

const ValueWithLabel = ({ label, children }: {label: string, children: React.ReactElement | any}) => (
  <div>
    <Box variant="awsui-key-label">{label}</Box>
    <div>{children}</div>
  </div>
);

type WorkflowProps = {
  workflow: MergedWorkflowDetails;
  key: number;
}
const Workflow = (props: WorkflowProps) => {
  const { workflow } = props;
  let statusType: StatusIndicatorProps.Type = 'in-progress';
  switch(workflow.status) {
    case 'POST_INVOKE':
      statusType = 'success';
      break;
    // TODO There might be more here but we can't see cause Pipedream API doesn't ENUM this field.
    case 'ERROR':
      statusType = 'error';
      break;
    default:
      break;
  }
  return (
    <Container header={
      <Header variant="h2">
        <img src={pipedreamLogo} alt="pipedream logo" width="23" height="23" />
        {` ${workflow.name}`}
      </Header>
    }>
    <ColumnLayout columns={4} variant="text-grid">
      <SpaceBetween size="l">
        <ValueWithLabel label="Status">
          {/* TODO Remove hard-coded value. */}
          <StatusIndicator iconAriaLabel={workflow.status} type={statusType}>{workflow.status}</StatusIndicator>
        </ValueWithLabel>
        <ValueWithLabel label="Version">
          {workflow.version || '-'}
        </ValueWithLabel>
      </SpaceBetween>
      <SpaceBetween size="l">
        <ValueWithLabel label="Created on">{moment(workflow.created_on).utc().fromNow()}</ValueWithLabel>
        <ValueWithLabel label="Modified on">{moment(workflow.modified_on).utc().fromNow()}</ValueWithLabel>
      </SpaceBetween>
      <SpaceBetween size="l">
      <ValueWithLabel label="Last run on">
          {moment(workflow.last_run_on).utc().fromNow() || '-'}
        </ValueWithLabel>
        <ValueWithLabel label="Organization">
          {workflow.organization || '-'}
        </ValueWithLabel>
      </SpaceBetween>
      <SpaceBetween size="l">
          <ValueWithLabel label="Total Request">
            {workflow.total_requests || '-'}
          </ValueWithLabel>
          <ValueWithLabel label="Total Errors">
            {workflow.total_errors || '-'}
          </ValueWithLabel>
      </SpaceBetween>
    </ColumnLayout>
  </Container>
  );
};

export default Workflow;