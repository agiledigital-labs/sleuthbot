/* eslint-disable no-console */
import { SQSEvent } from 'aws-lambda';

import { App, ExpressReceiver } from '@slack/bolt';
import { env, extractOutgoingMessage } from './common';
import { IncomingSqsMessage } from 'types';

export const handler = async (event: SQSEvent) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(event, undefined, 2));

  const bodies = event.Records.map(extractOutgoingMessage);

  const expressReceiver = new ExpressReceiver({
    signingSecret: env.SLACK_SIGNING_SECRET || '',
    processBeforeResponse: true,
  });

  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    receiver: expressReceiver,
    processBeforeResponse: true,
  });

  const sendMessage = (incomingMessage: IncomingSqsMessage) => {
    console.log(incomingMessage.message);

    return app.client.chat.postMessage({
      thread_ts: incomingMessage.originalMessage.messageThreadKey,
      token: env.SLACK_BOT_TOKEN,
      channel: incomingMessage.originalMessage.channel,
      blocks: incomingMessage.message,
      text: 'More logs for you to look at',
    });
  };

  const messagesOutgoing = bodies.map((message) => sendMessage(message));

  const results = await Promise.all(messagesOutgoing)
    .catch((errors) => console.error(errors))
    .finally(() =>
      console.log(
        'success in sending all messages: ' + new Date().toDateString()
      )
    );

  // eslint-disable-next-line no-console
  console.log(results);
};
