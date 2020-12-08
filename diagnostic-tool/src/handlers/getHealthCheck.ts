import { APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (): Promise<APIGatewayProxyResult> => ({
  statusCode: 200,
  body: 'Yay, I work',
});
