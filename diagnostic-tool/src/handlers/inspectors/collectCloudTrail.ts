import { SectionBlock } from '@slack/bolt';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { CloudTrail, SNS } from 'aws-sdk';
import { EventsList } from 'aws-sdk/clients/cloudtrail';
import { SleuthBotIncomingRequest, TimeWindow } from '../../types';
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
    { requestParameters: { functionName: string }; eventName: string }
  >JSON.parse(payload);

  if (
    serviceScope !== undefined &&
    data.requestParameters.functionName.includes(serviceScope)
  ) {
    return `\`${data.requestParameters.functionName}\``;
  }

  return `\`${data.requestParameters.functionName}\``;
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
  window: TimeWindow,
  token?: string
): Promise<EventsList> => {
  const result = await cloudTrail
    .lookupEvents({
      LookupAttributes: [{ AttributeKey: 'ReadOnly', AttributeValue: 'false' }],
      EndTime: new Date(window.endTime),
      StartTime: new Date(window.startTime),
      NextToken: token,
    })
    .promise();

  if (result.NextToken !== undefined) {
    await delay(250);
    return [
      ...result.Events!,
      ...(await fetchResults(window, result.NextToken)),
    ];
  }

  return result.Events ?? [];
};

const chunk = <T>(array: Array<T>, size: number): Array<Array<T>> =>
  Array.from({ length: Math.ceil(array.length / size) }, (v, i) =>
    array.slice(i * size, i * size + size)
  );

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

  if (logLines.length > 1) {
    await Promise.allSettled(
      chunk(logLines, 49).map(async (chunkOfMessages) =>
        sendOutgoingMessage(
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
              ...chunkOfMessages,
            ],
          },
          sns
        )
      )
    );
  } else {
    await sendOutgoingMessage(
      {
        originalMessage,
        message: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                "🔎 Audit Inspector here! I couldn't find any relevant CloudTrail events ",
            },
          },
        ],
      },
      sns
    );
  }
};

export const handler = async (event: SQSEvent) => {
  const formattedMessages = await Promise.allSettled(
    event.Records.map(async (sqsRecord: SQSRecord) => {
      const request = extractSlackCommand(sqsRecord);

      const results = await fetchResults(request.timeWindow);

      const filterAwsServices = results.filter(({ EventSource }) =>
        serviceFilter.includes(EventSource ?? '')
      );

      const formattedPayloads = filterAwsServices
        .map(
          ({
            EventName,
            Username,
            CloudTrailEvent,
            EventSource,
            EventTime,
          }) => ({
            EventName: eventNameStripping(EventName ?? ''),
            Username,
            EventSource: EventSource?.split('.')[0],
            TimeStamp: EventTime?.toISOString() ?? '',
            message: serviceMapping[EventSource ?? 'unknown'](request.text)(
              CloudTrailEvent
            ),
          })
        )
        .map(
          ({ EventName, Username, EventSource, message, TimeStamp }) =>
            `*Event*: ${EventName}\n*Timestamp*: ${TimeStamp}\n*User*: ${Username}\n*Source*: ${EventSource}\n${message}`
        );

      return { messages: formattedPayloads, request };
    })
  );

  formattedMessages.forEach(
    (value) =>
      value.status === 'fulfilled' && console.info(value.value.messages)
  );

  await Promise.allSettled(
    formattedMessages.map(async (value) =>
      value.status === 'fulfilled'
        ? sendMessage(value.value.messages, value.value.request)
        : undefined
    )
  );
};
