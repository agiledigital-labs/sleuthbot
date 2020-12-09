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
  meta: {
    rawPayload: SlashCommand;
    rawResponse: WebAPICallResult;
  };
};

export type SleuthBotNotification = {
  originalMessage: SleuthBotIncomingRequest;
  message: (KnownBlock | Block)[];
};
