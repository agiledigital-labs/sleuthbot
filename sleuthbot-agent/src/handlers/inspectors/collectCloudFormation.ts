import { SleuthBotIncomingRequest } from './../../types/index';
import { sendOutgoingMessage } from './../common';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { CloudFormation, SNS } from 'aws-sdk';
import { extractSlackCommand } from '../common';

const cloudFormation = new CloudFormation();
const sns = new SNS();

const sendMessage = async (
  request: SleuthBotIncomingRequest,
  message: string
) =>
  sendOutgoingMessage(
    {
      originalMessage: request,
      message: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🏗 Deployment inspector here. ${message}`,
          },
        },
      ],
    },
    sns
  );

export const handler = async (event: SQSEvent) => {
  await Promise.allSettled(
    event.Records.map(async (sqsRecord: SQSRecord) => {
      const request = extractSlackCommand(sqsRecord);

      if (request.text === undefined) {
        return;
      }

      const stacks = await cloudFormation
        .describeStacks({ StackName: request.text })
        .promise();

      if (stacks.Stacks?.length == 0) {
        return sendMessage(
          request,
          `I wasn\'t able to find the ${request.text} stack`
        );
      }

      const stack = stacks.Stacks![0];
      const lastDeployDate = stack.LastUpdatedTime ?? stack.CreationTime;

      if (
        lastDeployDate.getTime() >=
          new Date(request.timeWindow.startTime).getTime() &&
        lastDeployDate.getTime() <=
          new Date(request.timeWindow.endTime).getTime()
      ) {
        return sendMessage(
          request,
          `The last deployment for ${
            request.text
          } took place was ${lastDeployDate.toISOString()}`
        );
      }

      return sendMessage(
        request,
        `There has not been a recent deployment of ${request.text}`
      );
    })
  );
};
