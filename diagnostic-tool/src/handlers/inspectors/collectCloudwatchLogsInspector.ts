/* eslint-disable no-console */
import { SQSEvent } from 'aws-lambda';
import AWS from 'aws-sdk';
import { repeatWhileUndefined } from 'utils/async';
import { SleuthBotIncomingRequest } from '../../types';
import {
  extractSlackCommand,
  findResourcesInStack,
  sendOutgoingMessage,
} from '../common';

const resourceGroups = new AWS.ResourceGroups();
const cloudWatchLogs = new AWS.CloudWatchLogs();
const sns = new AWS.SNS();

const getLogs = async (
  originalMessage: SleuthBotIncomingRequest
): Promise<string[]> => {
  const stackName = originalMessage.text;
  if (typeof stackName !== 'string') {
    console.error('Missing stack name!');
    return [];
  }

  console.log(`Collecting logs for stack [${stackName}]...`);
  const names = await findResourcesInStack(
    stackName,
    ['AWS::Lambda::Function'],
    resourceGroups
  );

  if (names.length === 0) {
    console.warn('No matching resources found!');
    return [];
  }

  console.info(`Fetching interesting logs for lambdas [${names}]...`);

  const queryResponse = await cloudWatchLogs
    .startQuery({
      logGroupNames: names.map((n) => `/aws/lambda/${n}`),
      startTime: new Date(originalMessage.timeWindow.startTime).getTime(),
      endTime: new Date(originalMessage.timeWindow.endTime).getTime(),
      queryString: `
      fields @log, @message
      | filter @message LIKE /ERROR/
      | limit 20
      | sort @timestamp desc
    `,
      limit: 20,
    })
    .promise();

  const queryId = queryResponse.queryId;
  if (queryId === undefined) {
    throw new Error('Query ID is missing');
  }

  const queryResultResponse = await repeatWhileUndefined(async () => {
    const resultsResponse = await cloudWatchLogs
      .getQueryResults({
        queryId,
      })
      .promise();
    if (
      ['Complete', 'Failed', 'Cancelled'].includes(resultsResponse.status ?? '')
    ) {
      return resultsResponse;
    }
    return undefined;
  });

  if (queryResultResponse?.status !== 'Complete') {
    console.error(
      `Unexpected status [${queryResultResponse?.status}]. Will not continue`
    );
  }

  const results = queryResultResponse?.results ?? [];
  const lines = results.map(
    ([logName, logMessage]) =>
      `${logName.value ?? 'UNKNOWN'} ${logMessage.value ?? 'UNKNOWN'}`
  );
  console.info(`Retrieved [${lines.length}] lines of logs!`);
  return lines;
};

const sendMessageWithoutLogs = async (
  originalMessage: SleuthBotIncomingRequest
): Promise<void> => {
  await sendOutgoingMessage(
    {
      originalMessage,
      message: [],
      messageAsText:
        "📃 Log Inspector here! I didn't find any suspicious logs. Everything looks great over here!",
    },
    sns
  );
};

const sendMessageWithLogs = async (
  lines: string[],
  originalMessage: SleuthBotIncomingRequest
): Promise<void> => {
  const stringifiedLines = lines.join('\n');

  await sendOutgoingMessage(
    {
      originalMessage,
      message: [],
      messageAsText:
        "📃 Log Inspector here! I've fetched you some CloudWatch logs that might be relevant.\n\n ```\n" +
        stringifiedLines +
        '\n```',
    },
    sns
  );
};

export const handler = async (event: SQSEvent) => {
  for await (const record of event.Records) {
    const message = extractSlackCommand(record);
    const lines = await getLogs(message);
    if (lines.length > 0) {
      await sendMessageWithLogs(lines, message);
    } else {
      await sendMessageWithoutLogs(message);
    }
  }
};
