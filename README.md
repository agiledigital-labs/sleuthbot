# Sleuth Bot
Chat ops for Severless incidents in aws

## Basic usage


## Installing the bot into your aws account

## Setting up the slack part of the bot
You will need to set up the Slack app manually..... it woulds be nice is you didn't have to, but....

The slack bot will need the following oauth permissions to run:

| permission   | description |
| ------------ |:-----------:|
| channels:history   |   View messages and other content in public channels that sleuth bot has been added to|
| chat:write         |   Send messages as @sleuthbot|
| commands           |   Add shortcuts and/or slash commands that people can use|
| files:write        |   Upload, edit, and delete files as sleuth bot|
| im:history         |   View messages and other content in direct messages that sleuth bot has been added to|

The bot will also need to have the slash command and events associated with it.
These follow

slash commands:
* /start-incident

events:
* message.im | A message was posted in a direct message channel | im:history

### Environment variables
Make sure you add the following environment variables to the security section of the git hub account
* SLACK_BOT_TOKEN
* SLACK_SIGNING_SECRET

Both of which are created when you set up your application
