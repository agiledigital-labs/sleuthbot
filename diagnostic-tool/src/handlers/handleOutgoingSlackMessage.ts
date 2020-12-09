import { SQSEvent } from 'aws-lambda';

import { App, ExpressReceiver } from '@slack/bolt';
import { SlackCommandSnsEvent } from '../types';
import { cleanEnv, str } from 'envalid';
import { Block, KnownBlock } from '@slack/types';

export const handler = async (event: SQSEvent) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(event, undefined, 2));

  const env = cleanEnv(process.env, {
    SLACK_SIGNING_SECRET: str(),
    SLACK_BOT_TOKEN: str(),
  });

  interface IncomingSqsMessage {
    originalMessage: SlackCommandSnsEvent;
    message: (KnownBlock | Block)[];
  }

  const bodies = event.Records.map(
    ({ body }) => JSON.parse(JSON.parse(body).Message) as IncomingSqsMessage
  );

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

  const sendMessage = (incomingMessage: IncomingSqsMessage) =>
    app.client.chat.postMessage({
      thread_ts: incomingMessage.originalMessage.messageThreadKey,
      token: env.SLACK_BOT_TOKEN,
      channel: incomingMessage.originalMessage.channel,
      blocks: incomingMessage.message,
      text: 'More logs for you to look at',
    });

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
