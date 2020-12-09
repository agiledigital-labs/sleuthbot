import {SQSEvent} from 'aws-lambda';
import {SNS} from "aws-sdk";
import {cleanEnv, str} from "envalid";
import {SlackCommandSnsEvent} from "../types";


const sns = new SNS();

const env = cleanEnv(process.env, {
  SLACK_SIGNING_SECRET: str(),
  SLACK_BOT_TOKEN: str(),
  OUTGOING_SNS_TOPIC_ARN: str()
})


export const handler = async (event: SQSEvent) => {
  console.log(JSON.stringify(event, undefined, 2));

  const bodies = event.Records.map(({body}) => JSON.parse(body) as SlackCommandSnsEvent)

  const testPayload = (index: string) => (
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `SENT FROM OUTGOING SNS TOPIC HANDLER.\n message number ${index}`,
          },
        }
      ]
    )
  ;


  const sendMessage = async (body: SlackCommandSnsEvent) => {
    const numbers = new Array(Math.abs(Math.random() * 10));

    const outgoingMessages = numbers.map((_, index) => testPayload(index.toString(10)));

    const messages = await outgoingMessages.map(async message => {

      const outgoingPayload = JSON.stringify({originalMessage: body, message: message});

      await sns
        .publish({
          TopicArn: env.OUTGOING_SNS_TOPIC_ARN,
          Message: JSON.stringify(outgoingPayload),
        })
        .promise();
    })
    return Promise.all(messages)
  };

  await Promise.all(bodies.map(async body => sendMessage(body)))
    .catch((error) => console.error(error))
    .finally(() => console.log("done"))


};

