import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { SmashConfig } from './config';

export interface BootstrapStackProps extends StackProps {
  config: SmashConfig;
}

export const DEPLOY_ROLE_NAME = 'Smash-GitHubDeploy';

/**
 * One-time, environment-independent: GitHub OIDC provider and the deploy role assumed by
 * .github/workflows/deploy.yml. The role can only assume the CDK bootstrap roles, publish the
 * web bundle, and read stack outputs.
 */
export class BootstrapStack extends Stack {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
    super(scope, id, props);
    const { config } = props;

    const provider = config.githubOidcProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GitHubOidc', config.githubOidcProviderArn)
      : new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });

    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: DEPLOY_ROLE_NAME,
      description: `GitHub Actions deploy role for ${config.githubRepo}`,
      maxSessionDuration: Duration.hours(2),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${config.githubRepo}:ref:refs/heads/main`,
            `repo:${config.githubRepo}:ref:refs/heads/develop`,
          ],
        },
      }),
    });

    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-${config.bootstrapQualifier}-*`],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadStackOutputs',
        actions: ['cloudformation:DescribeStacks'],
        resources: [`arn:${this.partition}:cloudformation:*:${this.account}:stack/Smash-*/*`],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PublishWebBundle',
        actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [`arn:${this.partition}:s3:::smash-*-web-*`, `arn:${this.partition}:s3:::smash-*-web-*/*`],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvalidateCloudFront',
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:${this.partition}:cloudfront::${this.account}:distribution/*`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn });
  }
}
