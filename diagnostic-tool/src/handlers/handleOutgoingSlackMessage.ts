import { SQSEvent } from 'aws-lambda';

import { App } from '@slack/bolt';

export const handler = async (event: SQSEvent) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(event, undefined, 2));

  const botToken = 'TODO GET FROM INCOMING MESSAGE';
  const channel_id = 'TODO GET FROM INCOMING MESSAGE';

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    processBeforeResponse: true,
  });

  const result = await app.client.chat.postMessage({
    token: botToken,
    // Channel to send message to
    channel: channel_id,
    // Include a button in the message (or whatever blocks you want!)
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'SENT FROM OUTGOING SNS TOPIC HANDLER.',
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Click me!',
          },
          action_id: 'button_abc',
        },
      },
    ],
    // Text in the notification
    text: 'Message from Test App',
  });
  // eslint-disable-next-line no-console
  console.log(result);
};
