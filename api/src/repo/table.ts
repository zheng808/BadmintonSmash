import {
  CreateTableCommand, DescribeTableCommand, DynamoDBClient, UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';

/** Creates the single table (PK/SK + GSI1 + GSI2) for DynamoDB Local and tests. CDK owns it in AWS. */
export async function createTableIfMissing(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch (err) {
    if ((err as { name?: string }).name !== 'ResourceNotFoundException') throw err;
  }
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'].map((a) => ({ AttributeName: a, AttributeType: 'S' })),
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: (['GSI1', 'GSI2'] as const).map((g) => ({
        IndexName: g,
        KeySchema: [
          { AttributeName: `${g}PK`, KeyType: 'HASH' },
          { AttributeName: `${g}SK`, KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      })),
    }),
  );
  for (let i = 0; i < 50; i++) {
    const d = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (d.Table?.TableStatus === 'ACTIVE') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  try {
    await client.send(new UpdateTimeToLiveCommand({ TableName: tableName, TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true } }));
  } catch {
    /* DynamoDB Local may not support TTL; harmless */
  }
}
