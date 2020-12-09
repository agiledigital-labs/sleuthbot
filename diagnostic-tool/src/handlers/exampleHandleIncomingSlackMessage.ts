/* eslint-disable no-console */
import { SQSEvent } from 'aws-lambda';
import { SNS } from 'aws-sdk';
import { cleanEnv, str } from 'envalid';
import { SlackCommandSnsEvent } from '../types';
import { extractSlackCommand, sendOutgoingMessage } from './common';

const sns = new SNS();

const env = cleanEnv(process.env, {
  SLACK_SIGNING_SECRET: str(),
  SLACK_BOT_TOKEN: str(),
  OUTGOING_SNS_TOPIC_ARN: str(),
});

export const handler = async (event: SQSEvent) => {
  console.log(JSON.stringify(event, undefined, 2));

  const bodies = event.Records.map(extractSlackCommand);

  const testPayload = (index: string) => [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `SENT FROM OUTGOING SNS TOPIC HANDLER.\n message number ${index}`,
      },
    },
  ];
  const sendMessage = async (body: SlackCommandSnsEvent) => {
    const outgoingMessages = [testPayload('1'), testPayload('2')];

    const messages = await outgoingMessages.map(async (message) => {
      const outgoingPayload = {
        originalMessage: body,
        message: message,
      };
      console.log(outgoingPayload);
      await sendOutgoingMessage(outgoingPayload, sns);
    });
    return Promise.all(messages);
  };

  await Promise.all(bodies.map(async (body) => await sendMessage(body)))
    .catch((error) => console.error(error))
    .finally(() => console.log('done'));
};
