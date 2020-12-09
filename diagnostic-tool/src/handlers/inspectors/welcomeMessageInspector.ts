/* eslint-disable no-console */
import { SQSEvent } from 'aws-lambda';
import { SNS } from 'aws-sdk';
import { SleuthBotIncomingRequest } from '../../types';
import { extractSlackCommand, sendOutgoingMessage } from '../common';

const sns = new SNS();

export const handler = async (event: SQSEvent) => {
  const bodies = event.Records.map(extractSlackCommand);

  const sendMessage = async (body: SleuthBotIncomingRequest) => {
    await sendOutgoingMessage(
      {
        message: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                "🕵️‍♂️ I'm sending some inspectors out to do some investigation. You should hear from them shortly.",
            },
          },
        ],
        originalMessage: body,
      },
      sns
    );
  };

  await Promise.all(bodies.map(async (body) => await sendMessage(body)))
    .catch((error) => console.error(error))
    .finally(() => console.log('done'));
};
