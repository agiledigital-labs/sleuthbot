/* eslint-disable no-console */
import { SQSEvent } from 'aws-lambda';
import AWS from 'aws-sdk';
import { SleuthBotIncomingRequest } from '../../types';
import { extractSlackCommand, sendOutgoingMessage } from '../common';

function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

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

  const query = {
    ResourceTypeFilters: ['AWS::Lambda::Function'],
    TagFilters: [
      { Key: 'aws:cloudformation:stack-name', Values: [stackName] },
      // { Key: 'STAGE', Values: [process.env.STAGE] },
    ],
  };

  console.log('query', query);

  const searchResourceResponse = await resourceGroups
    .searchResources({
      ResourceQuery: {
        Type: 'TAG_FILTERS_1_0',
        Query: JSON.stringify(query),
      },
    })
    .promise();

  const resourceIds = searchResourceResponse.ResourceIdentifiers ?? [];
  console.log('resourceIds', resourceIds);
  const names = resourceIds
    .map((rid) => rid.ResourceArn?.split(':')[6])
    .filter(notUndefined);

  if (names.length === 0) {
    console.warn('No matching resources found!');
    return [];
  }

  console.info(`Fetching interesting logs for log groups [${names}]...`);

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

const delayFn = (delay: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delay));

const repeatWhileUndefined = async <T>(
  fn: () => Promise<T | undefined>,
  maxAttempts = 10,
  delay = 3000,
  attempt = 0
): Promise<T | undefined> => {
  const result = await fn();
  if (result === undefined) {
    console.log(`Result was undefined, Will try again after [${delay}] ms`);
    await delayFn(delay);
    // eslint-disable-next-line unused-imports/no-unused-vars-ts
    return await repeatWhileUndefined(fn, maxAttempts, delay, attempt + 1);
  } else {
    return result;
  }
};

const sendMessage = async (
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
      await sendMessage(lines, message);
    }
  }
};
