import { SQSRecord } from 'aws-lambda';
import { SNS } from 'aws-sdk';
import { cleanEnv, str } from 'envalid';
import { SleuthBotNotification, SleuthBotIncomingRequest } from 'types';

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
