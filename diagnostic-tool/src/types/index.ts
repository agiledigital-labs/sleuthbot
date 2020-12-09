/**
 * Metadata from request to make a slack message
 * example shown below
 */
import {SlashCommand} from "@slack/bolt";
import {WebAPICallResult} from "@slack/web-api/dist/WebClient";


export type SlackCommandSnsEvent = {
  token: string ,
  channel: string ,
  text?: string ,
  message: string ,
  incidentId: string ,
  messageThreadKey: string ,
  meta: {
    rawPayload: SlashCommand,
    rawResponse: WebAPICallResult
  }
}
