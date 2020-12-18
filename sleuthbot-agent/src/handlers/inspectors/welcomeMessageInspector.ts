import { SNS } from 'aws-sdk';
import { SleuthBotIncomingRequest } from '../../types';
import { createInspectorHandler, sendOutgoingMessage } from '../common';

const sns = new SNS();

export const handler = createInspectorHandler(
  async (message: SleuthBotIncomingRequest) => {
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
        originalMessage: message,
      },
      sns
    );
  },
  'Welcome Inspector'
);
