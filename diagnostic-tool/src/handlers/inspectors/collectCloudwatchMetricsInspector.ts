/* eslint-disable no-console */
import { SQSEvent } from 'aws-lambda';
import AWS from 'aws-sdk';
import { SleuthBotIncomingRequest } from '../../types';
import { extractSlackCommand, sendOutgoingMessage } from '../common';

const sns = new AWS.SNS();

const sendMessage = async (
  originalMessage: SleuthBotIncomingRequest
): Promise<void> => {
  await sendOutgoingMessage(
    {
      originalMessage,
      message: [],
      messageAsText:
        "📈 Metrics Inspector here! I'm not implemented yet. Sorry!",
    },
    sns
  );
};

export const handler = async (event: SQSEvent) => {
  for await (const record of event.Records) {
    const message = extractSlackCommand(record);
    await sendMessage(message);
  }
};
