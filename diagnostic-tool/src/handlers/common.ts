/* eslint-disable no-console */
import {
  Context,
  AppRequestedEvent,
  MessageAttachment,
  MessageEvent,
  SlashCommand,
} from '@slack/bolt';
import { SQSRecord } from 'aws-lambda';
import { ResourceGroups, SNS } from 'aws-sdk';
import { cleanEnv, str } from 'envalid';
import {
  SleuthBotNotification,
  SleuthBotIncomingRequest,
  TimeWindow,
} from 'types';
import { WebAPICallResult } from '@slack/web-api/dist/WebClient';

export const env = cleanEnv(process.env, {
  SLACK_SIGNING_SECRET: str(),
  SLACK_BOT_TOKEN: str(),
  INCOMING_SNS_TOPIC_ARN: str(),
  OUTGOING_SNS_TOPIC_ARN: str(),
});

export const extractSlackCommand = ({
  body,
}: SQSRecord): SleuthBotIncomingRequest =>
  JSON.parse(JSON.parse(body).Message) as SleuthBotIncomingRequest;

export const extractOutgoingMessage = ({
  body,
}: SQSRecord): SleuthBotNotification =>
  JSON.parse(JSON.parse(body).Message) as SleuthBotNotification;

export const sendOutgoingMessage = async (
  message: SleuthBotNotification,
  sns: SNS
) => {
  await sns
    .publish({
      TopicArn: env.OUTGOING_SNS_TOPIC_ARN,
      Message: JSON.stringify(message),
    })
    .promise();
};

export const standardResponse: string =
  '🕵️‍♂️ SleuthBot is on the case! Updates will be posted in a thread. Stand by!';

const sns = new SNS();

export const sendSlackEvent = async (
  outgoingPayload: SleuthBotIncomingRequest
) => {
  await sns
    .publish({
      TopicArn: env.INCOMING_SNS_TOPIC_ARN,
      Message: JSON.stringify(outgoingPayload),
    })
    .promise();
};

export const makeTimeWindow = (
  endTime: number,
  startTime: number
): TimeWindow => ({
  startTime: new Date(startTime).toISOString(),
  endTime: new Date(endTime).toISOString(),
});

export const makeOutgoingPayload = (
  context: Context,
  payload: SlashCommand | MessageEvent | AppRequestedEvent,
  incidentId: string,
  messageThreadKey: unknown | string,
  result: WebAPICallResult | MessageAttachment | any,
  timeWindow: TimeWindow,
  channel: string
): SleuthBotIncomingRequest => {
  const message = {
    token: context.botToken,
    channel,
    text: payload.text,
    message: 'incident started',
    incidentId,
    messageThreadKey: result.ts,
    meta: {
      rawPayload: payload,
      rawResponse: result,
    },
    // TODO: Make this configurable/not terrible
    timeWindow,
  } as SleuthBotIncomingRequest;
  return message;
};

export function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

/**
 * Finds resources in a Stack
 *
 * @param stackName The name of the stack to fetch resources for
 * @param resourceTypeFilters a list of resource types to fetch. E.g. ['AWS::Lambda::Function']
 * @param resourceGroups the AWS SDK client for Resource Groups
 */
export const findResourcesInStack = async (
  stackName: string,
  resourceTypeFilters: ReadonlyArray<string>,
  resourceGroups: ResourceGroups
) => {
  const query = {
    ResourceTypeFilters: resourceTypeFilters,
    TagFilters: [
      { Key: 'aws:cloudformation:stack-name', Values: [stackName] },
      // { Key: 'STAGE', Values: [process.env.STAGE] },
    ],
  };

  console.log('Resource groups query: ', query);

  const searchResourceResponse = await resourceGroups
    .searchResources({
      ResourceQuery: {
        Type: 'TAG_FILTERS_1_0',
        Query: JSON.stringify(query),
      },
    })
    .promise();

  const resourceIds = searchResourceResponse.ResourceIdentifiers ?? [];
  return resourceIds
    .map((rid) => rid.ResourceArn?.split(':')[6])
    .filter(notUndefined);
};

const delayFn = (delay: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delay));

export const repeatWhileUndefined = async <T>(
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
