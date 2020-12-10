/**
 * Metadata from request to make a slack message
 * example shown below
 */
import { Block, KnownBlock, SlashCommand } from '@slack/bolt';
import { WebAPICallResult } from '@slack/web-api/dist/WebClient';

export type SleuthBotIncomingRequest = {
  token: string;
  channel: string;
  text?: string;
  message: string;
  incidentId: string;
  messageThreadKey: string;
  // The period of time to do the investigation on
  timeWindow: {
    // ISO Dates
    startTime: string;
    endTime: string;
  };
  meta: {
    rawPayload: SlashCommand;
    rawResponse: WebAPICallResult;
  };
};

export type SleuthBotNotification = {
  originalMessage: SleuthBotIncomingRequest;
  message: (KnownBlock | Block)[];
  // Normal non block text that can be much longer
  // If no blocks provided, will be used as the body text.
  // Otherwise it will be used as the notification text only
  messageAsText?: string | undefined;
};
