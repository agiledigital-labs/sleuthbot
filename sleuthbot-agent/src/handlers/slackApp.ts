/* eslint-disable no-console */
import { App, ExpressReceiver } from '@slack/bolt';
import awsServerlessExpress from 'aws-serverless-express';
import { APIGatewayEvent, Context } from 'aws-lambda';
import { v4 } from 'uuid';
import {
  env,
  makeOutgoingPayload,
  makeTimeWindow,
  sendSlackEvent,
  standardResponse,
} from './common';

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

app.command('/investigate', async ({ ack, payload, context }) => {
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
            text: standardResponse,
          },
        },
      ],
      // Text in the notification
      text: 'SleuthBot is on the case!',
    });

    const time = makeTimeWindow(
      new Date().getTime(),
      new Date(new Date().getTime() - 15 * 60 * 1000).getTime()
    );

    await sendSlackEvent(
      makeOutgoingPayload(
        context,
        payload,
        incidentId,
        result.ts,
        result,
        time,
        payload.channel_id
      )
    );

    console.log(result);
  } catch (error) {
    console.error(error);
  }
});

app.event('message', async ({ say, payload, context, client, body }) => {
  const metricConversion = 1000;

  const searchWindow = 15 * 60 * metricConversion;

  if (payload.thread_ts) {
    const channel = payload.channel;

    const threadTs = payload.thread_ts;

    const history = await client.conversations.history({
      channel: channel,
      limit: 50,
    });

    const messages = history.messages as Array<{
      ts?: string;
      attachments?: any;
    }>;

    const messageParent = messages.find((item) => item.ts === threadTs);

    if (!messageParent) {
      return;
    }

    const incidentId = v4();

    const timeOfEvent = messageParent.attachments[0].ts as string;

    const eventJsonTimeStamp = parseInt(timeOfEvent, 10) * metricConversion;

    const searchStartTimeStamp = eventJsonTimeStamp - searchWindow;

    const readableTimeString = (timeStamp: number) =>
      new Date(timeStamp).toTimeString();

    await say(
      `We will start looking at for errors between ${readableTimeString(
        searchStartTimeStamp
      )} and ${readableTimeString(eventJsonTimeStamp)}`
    );

    const time = makeTimeWindow(eventJsonTimeStamp, searchStartTimeStamp);

    await sendSlackEvent(
      makeOutgoingPayload(
        context,
        payload,
        incidentId,
        timeOfEvent,
        { payload: payload, attachments: messageParent?.attachments[0] },
        time,
        messageParent.attachments[0].channel_id
      )
    );

    return;
  } else if (!payload.attachments) {
    await say('Sorry we could not find an event to investigate');
    return;
  } else {
    await say(standardResponse);
    await say(
      'To help us out could you add the name of the services you want to check in a thread on your shared message' +
        ' above :pray:'
    );

    return;
  }
});

const server = awsServerlessExpress.createServer(expressReceiver.app);

export const handler = (event: APIGatewayEvent, context: Context) => {
  awsServerlessExpress.proxy(server, event, context);
};
