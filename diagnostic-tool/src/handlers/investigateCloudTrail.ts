import { SNSMessage, SQSEvent, SQSRecord } from 'aws-lambda';
import { CloudTrail } from 'aws-sdk';
import { EventsList } from 'aws-sdk/clients/cloudtrail';
import { extractSlackCommand } from './common';

const cloudTrail = new CloudTrail();

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

export const handler = async (event: SQSEvent) => {
  return Promise.allSettled(
    event.Records.map(async (sqsRecord: SQSRecord) => {
      const {} = extractSlackCommand(sqsRecord);

      const results = await fetchResults(new Date());

      return results.map(
        ({
          EventId,
          EventName,
          EventTime,
          Username,
          EventSource,
          CloudTrailEvent,
        }) => ({
          EventId,
          EventName,
          EventTime,
          EventSource,
          Username,
          CloudTrailEvent,
        })
      );
    })
  );
};

(async () => {
  const result = await handler({
    Records: [
      // @ts-ignore
      {
        body: JSON.stringify({
          Message: JSON.stringify({ text: 'Test' }),
        } as SNSMessage),
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.dir(
    result.map((value) => value),
    { depth: undefined, colors: true }
  );
  console.info(result.length);
})();
