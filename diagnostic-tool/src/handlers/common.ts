import { SQSRecord } from 'aws-lambda';
import { SNS } from 'aws-sdk';
import { cleanEnv, str } from 'envalid';
import { IncomingSqsMessage, SlackCommandSnsEvent } from 'types';

const env = cleanEnv(process.env, {
  OUTGOING_SNS_TOPIC_ARN: str(),
});

export const extractSlackCommand = ({
  body,
}: SQSRecord): SlackCommandSnsEvent =>
  JSON.parse(JSON.parse(body).Message) as SlackCommandSnsEvent;

export const extractOutgoingMessage = ({
  body,
}: SQSRecord): IncomingSqsMessage =>
  JSON.parse(JSON.parse(body).Message) as IncomingSqsMessage;

export const sendOutgoingMessage = async (
  message: IncomingSqsMessage,
  sns: SNS
) => {
  await sns
    .publish({
      TopicArn: env.OUTGOING_SNS_TOPIC_ARN,
      Message: JSON.stringify(message),
    })
    .promise();
};
