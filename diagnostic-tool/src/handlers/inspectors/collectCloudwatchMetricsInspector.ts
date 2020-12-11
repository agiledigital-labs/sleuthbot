/* eslint-disable no-console */
import { MrkdwnElement } from '@slack/bolt';
import AWS from 'aws-sdk';
import { SleuthBotIncomingRequest } from '../../types';
import {
  createInspectorHandler,
  findResourcesInStack,
  sendOutgoingMessage,
} from '../common';

const resourceGroups = new AWS.ResourceGroups();
const sns = new AWS.SNS();
const cloudWatch = new AWS.CloudWatch();

const getMetrics = async (
  originalMessage: SleuthBotIncomingRequest
): Promise<Record<string, number>> => {
  const stackName = originalMessage.text;
  if (typeof stackName !== 'string') {
    console.error('Missing stack name!');
    return {};
  }

  console.log(`Collecting logs for stack [${stackName}]...`);
  const names = await findResourcesInStack(
    stackName,
    ['AWS::Lambda::Function'],
    resourceGroups
  );

  if (names.length === 0) {
    console.warn('No matching resources found!');
    return {};
  }

  const resultMap: Record<string, number> = {};
  console.info(`Fetching interesting metrics for lambdas: [${names}]`);
  for await (const name of names) {
    const metricsResponse = await cloudWatch
      .getMetricStatistics({
        Namespace: 'Lambda',
        MetricName: 'Errors',
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: name,
          },
        ],
        StartTime: new Date(originalMessage.timeWindow.startTime),
        EndTime: new Date(originalMessage.timeWindow.endTime),
        Period: 300,
        Statistics: ['Sum'],
      })
      .promise();
    const dataPoints = metricsResponse.Datapoints ?? [];
    const totalErrors = dataPoints.reduce(
      (prev, { Sum }) => prev + (Sum ?? 0),
      0
    );
    if (totalErrors > 0) {
      resultMap[name] = totalErrors;
    }
  }

  return resultMap;
};

const sendMessageGood = async (
  originalMessage: SleuthBotIncomingRequest
): Promise<void> => {
  await sendOutgoingMessage(
    {
      originalMessage,
      message: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              '📈 Metrics Inspector here! Your metrics are looking good. Nothing to see here!',
          },
        },
      ],
    },
    sns
  );
};

const sendMessageBad = async (
  resultMap: Record<string, number>,
  originalMessage: SleuthBotIncomingRequest
): Promise<void> => {
  const metricsFields: MrkdwnElement[] = Object.entries(resultMap).flatMap(
    ([name, totalCount]) => [
      {
        type: 'mrkdwn',
        text: `*${name}*`,
      },
      {
        type: 'mrkdwn',
        text: `${totalCount}`,
      },
    ]
  );

  await sendOutgoingMessage(
    {
      originalMessage,
      message: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              "📈 Metrics Inspector here! I've found some suspicious metrics. Take a look:",
          },
          fields: metricsFields,
        },
      ],
    },
    sns
  );
};

export const handler = createInspectorHandler(
  async (message: SleuthBotIncomingRequest) => {
    const resultMap = await getMetrics(message);
    if (Object.keys(resultMap).length > 0) {
      await sendMessageBad(resultMap, message);
    } else {
      await sendMessageGood(message);
    }
  },
  'Metrics Inspector'
);
