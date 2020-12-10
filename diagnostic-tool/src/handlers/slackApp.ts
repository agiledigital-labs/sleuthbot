/* eslint-disable no-console */
import { App, ExpressReceiver } from '@slack/bolt';
import awsServerlessExpress from 'aws-serverless-express';
import { APIGatewayEvent, Context } from 'aws-lambda';
import { v4 } from 'uuid';
import { SNS } from 'aws-sdk';
import { SleuthBotIncomingRequest } from '../types';
import { env } from './common';

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

const sns = new SNS();

app.command('/start-incident', async ({ ack, payload, context }) => {
  console.log('Starting');

  // Acknowledge the command request
  await ack();

  const incidentId = v4();

  try {
    const result = await app.client.chat.postMessage({
      token: context.botToken,
      // Channel to send message to
      channel: payload.channel_id,
      // Include a button in the message (or whatever blocks you want!)
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              '🕵️‍♂️ SleuthBot is on the case! Updates will be posted this thread. Stand by!',
          },
        },
      ],
      // Text in the notification
      text: 'SleuthBot is on the case!',
    });

    const outgoingPayload: SleuthBotIncomingRequest = {
      token: context.botToken,
      channel: payload.channel_id,
      text: payload.text,
      message: 'incident started',
      incidentId,
      messageThreadKey: result.ts,
      meta: {
        rawPayload: payload,
        rawResponse: result,
      },
      // TODO: Make this configurable/not terrible
      timeWindow: {
        startTime: new Date(
          new Date().getTime() + 15 * 60 * 1000
        ).toISOString(),
        endTime: new Date().toISOString(),
      },
    } as SleuthBotIncomingRequest;

    await sns
      .publish({
        TopicArn: env.INCOMING_SNS_TOPIC_ARN,
        Message: JSON.stringify(outgoingPayload),
      })
      .promise();

    console.log(result);
  } catch (error) {
    console.error(error);
  }
});

const server = awsServerlessExpress.createServer(expressReceiver.app);

export const handler = (event: APIGatewayEvent, context: Context) => {
  awsServerlessExpress.proxy(server, event, context);
};
