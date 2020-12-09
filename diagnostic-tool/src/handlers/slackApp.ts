import {App, ExpressReceiver} from '@slack/bolt';
import awsServerlessExpress from 'aws-serverless-express';
import {APIGatewayEvent, Context} from 'aws-lambda';
import {v4} from 'uuid';
import {SNS} from 'aws-sdk';
import {str, cleanEnv} from "envalid";

const env = cleanEnv(process.env, {
  SLACK_SIGNING_SECRET: str(),
  SLACK_BOT_TOKEN: str(),
  INCOMING_SNS_TOPIC_ARN: str()
})

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


app.command('/start-incident', async ({ack, payload, context}) => {
  // Acknowledge the command request
  console.log('Starting');

  await ack();

  const incidentId = v4();

  const outgoingPayload = {
    token: context.botToken,
    channel: payload.channel_id,
    text: payload.text,
    message: 'incident started',
    incidentId,
    meta: {
      raw: payload
    }
  };

  // eslint-disable-next-line no-console
  console.log('Sending SNS message');
  await sns
    .publish({
      // TODO: Use envalid for these
      TopicArn: env.INCOMING_SNS_TOPIC_ARN,
      Message: JSON.stringify(outgoingPayload),
    })
    .promise();

  // eslint-disable-next-line no-console
  console.log('Sending Slack message');
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
            text: `ID: ${incidentId}`,
          },
        },
      ],
      // Text in the notification
      text: 'Incident started!',
    });
    // eslint-disable-next-line no-console
    console.log(result);
  } catch (error) {
    console.error(error);
  }
});

// Listen for a button invocation with action_id `button_abc`
// You must set up a Request URL under Interactive Components on your app configuration page
app.action('button_abc', async ({ack, body, context}: any) => {
  // Acknowledge the button request
  ack();

  try {
    // Update the message
    const result = await app.client.chat.update({
      token: context.botToken,
      // ts of message to update
      ts: body.message.ts,
      // Channel of message
      channel: body.channel.id,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*The button was clicked!*',
          },
        },
      ],
      text: 'Message from Test App',
    });
    // eslint-disable-next-line no-console
    console.log(result);
  } catch (error) {
    console.error(error);
  }
});

const server = awsServerlessExpress.createServer(expressReceiver.app);

export const handler = (event: APIGatewayEvent, context: Context) => {
  awsServerlessExpress.proxy(server, event, context);
};
