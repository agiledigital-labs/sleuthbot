/* eslint-disable no-console */
import { App, ExpressReceiver } from '@slack/bolt';
import awsServerlessExpress from 'aws-serverless-express';
import { APIGatewayEvent, Context } from 'aws-lambda';
import { v4 } from 'uuid';
import { SNS } from 'aws-sdk';
import { str, cleanEnv } from 'envalid';
import { SlackCommandSnsEvent } from '../types';

const env = cleanEnv(process.env, {
  SLACK_SIGNING_SECRET: str(),
  SLACK_BOT_TOKEN: str(),
  INCOMING_SNS_TOPIC_ARN: str(),
});

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
            text: `ID: ${incidentId} \n The logs for the incident will be added in a thread`,
          },
        },
      ],
      // Text in the notification
      text: 'Incident started!',
    });

    const outgoingPayload: SlackCommandSnsEvent = {
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
    } as SlackCommandSnsEvent;

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
