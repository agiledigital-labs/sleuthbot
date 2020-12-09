import type { AWS } from "@serverless/typescript";
import { env } from "process";

const serverlessConfiguration: AWS = {
  service: "test-environment",
  frameworkVersion: "2",
  custom: {
    webpack: {
      webpackConfig: "./webpack.config.js",
      includeModules: true,
    },
  },
  // Add the serverless-webpack plugin
  plugins: ["serverless-webpack"],
  provider: {
    name: "aws",
    runtime: "nodejs12.x",
    region: "ap-southeast-2",
    stage: env.STAGE ?? "dev",
    apiGateway: {
      minimumCompressionSize: 1024,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
    },
  },
  functions: {
    hello: {
      handler: "src/handlers/handler.hello",
      events: [
        {
          http: {
            method: "get",
            path: "hello",
          },
        },
      ],
    },
    scheduled: {
      handler: "src/handlers/scheduledEvent.scheduled",
      events: [
        {
          schedule: {
            rate: "rate(1 minute)",
          },
        },
      ],
    },
  },
};

module.exports = serverlessConfiguration;
