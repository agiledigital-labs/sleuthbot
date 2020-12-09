/* eslint-disable no-console */
import { SectionBlock } from '@slack/bolt';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import AWS from 'aws-sdk';
import { SlackCommandSnsEvent } from 'types';

function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

/*

Test payload

{
  "Records": [
    {
      "messageId": "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
      "receiptHandle": "MessageReceiptHandle",
      "body": "{\"text\":\"test-environment-main\"}",
      "attributes": {
        "ApproximateReceiveCount": "1",
        "SentTimestamp": "1523232000000",
        "SenderId": "123456789012",
        "ApproximateFirstReceiveTimestamp": "1523232000001"
      },
      "messageAttributes": {},
      "md5OfBody": "{{{md5_of_body}}}",
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:ap-southeast-2:123456789012:MyQueue",
      "awsRegion": "ap-southeast-2"
    }
  ]
}

*/

// const sns = new AWS.SNS();
const resourceGroups = new AWS.ResourceGroups();
const cloudWatchLogs = new AWS.CloudWatchLogs();
const sns = new AWS.SNS();

const getLogs = async (record: SQSRecord): Promise<string[]> => {
  const payload = JSON.parse(record.body);
  const stackName = payload.text;
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
      startTime: new Date().getTime() - 15 * 60 * 1000,
      endTime: new Date().getTime(),
      queryString: `
      fields @message
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
  const lines = results.map((r) => r[0].value).filter(notUndefined);
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
  record: SQSRecord
): Promise<void> => {
  const originalMessage = JSON.parse(
    JSON.parse(record.body).Message
  ) as SlackCommandSnsEvent;

  const lineString = lines.join('/n');

  const slackPayload: SectionBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '```\n' + lineString + '\n```',
      },
    },
  ];

  await sns
    .publish({
      TopicArn: process.env.OUTGOING_SNS_TOPIC_ARN,
      Message: JSON.stringify({ originalMessage, message: slackPayload }),
    })
    .promise();
};

export const handler = async (event: SQSEvent) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(event, undefined, 2));

  for await (const record of event.Records) {
    const lines = await getLogs(record);
    if (lines.length > 0) {
      await sendMessage(lines, record);
    }
  }
};
