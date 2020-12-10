import { SectionBlock } from '@slack/bolt';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { CloudTrail, SNS } from 'aws-sdk';
import { EventsList } from 'aws-sdk/clients/cloudtrail';
import { SleuthBotIncomingRequest } from '../../types';
import { extractSlackCommand, sendOutgoingMessage } from '../common';

const cloudTrail = new CloudTrail();
const sns = new SNS();

type Fetcher = (
  serviceScope: string | undefined
) => (payload: string | undefined) => string | undefined;

const lambdaDataFetcher: Fetcher = (serviceScope) => (payload) => {
  if (payload === undefined) {
    return undefined;
  }

  const data = <
    { responseElements: { functionName: string }; eventName: string }
  >JSON.parse(payload);

  if (data.responseElements.functionName.includes(serviceScope ?? '')) {
    return `\`${data.responseElements.functionName}\``;
  }

  return undefined;
};

const serviceMapping: Record<string, Fetcher> = {
  'lambda.amazonaws.com': lambdaDataFetcher,
  // eslint-disable-next-line unused-imports/no-unused-vars-ts
  unknown: (_) => (_) => undefined,
};
const serviceFilter = Object.keys(serviceMapping);

const eventNameStripping = (name: string) =>
  name.substring(0, /[0-9]/.exec(name)?.index);

const delay = async (timeout: number) =>
  new Promise<void>((resolve) => {
    setTimeout(() => resolve(), timeout);
  });

const fetchResults = async (
  date: Date,
  token?: string
): Promise<EventsList> => {
  const result = await cloudTrail
    .lookupEvents({
      LookupAttributes: [{ AttributeKey: 'ReadOnly', AttributeValue: 'false' }],
      EndTime: date,
      StartTime: new Date(date.getTime() - 240 * 60000),
      NextToken: token,
    })
    .promise();

  if (result.NextToken !== undefined) {
    await delay(500);
    return [...result.Events!, ...(await fetchResults(date, result.NextToken))];
  }

  return result.Events ?? [];
};

export const sendMessage = async (
  lines: string[],
  originalMessage: SleuthBotIncomingRequest
): Promise<void> => {
  const logLines: SectionBlock[] = lines.map((line) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: line,
    },
  }));

  await sendOutgoingMessage(
    {
      originalMessage,
      message: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              "🔎 Audit Inspector here! I've fetched you some CloudTrail events that might be relevant. Hope it helps!",
          },
        },
        ...logLines,
      ],
    },
    sns
  );
};

export const handler = async (event: SQSEvent) => {
  const formattedMessages = await Promise.allSettled(
    event.Records.map(async (sqsRecord: SQSRecord) => {
      const request = extractSlackCommand(sqsRecord);

      const results = await fetchResults(new Date());

      const filterAwsServices = results.filter(({ EventSource }) =>
        serviceFilter.includes(EventSource ?? '')
      );

      const formattedPayloads = filterAwsServices
        .map(({ EventName, Username, CloudTrailEvent, EventSource }) => ({
          EventName: eventNameStripping(EventName ?? ''),
          Username,
          EventSource: EventSource?.split('.')[0],
          message: serviceMapping['unknown'](request.text)(CloudTrailEvent),
        }))
        .map(
          ({ EventName, Username, EventSource, message }) =>
            `*Event*: ${EventName}\n*User*: ${Username}\n*Source*: ${EventSource}\n${message}`
        );

      return { messages: formattedPayloads, request };
    })
  );

  await Promise.allSettled(
    formattedMessages.map(async (value) =>
      value.status === 'fulfilled'
        ? sendMessage(value.value.messages, value.value.request)
        : undefined
    )
  );
};
