import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { SmashConfig } from './config';

export interface WebStackProps extends StackProps {
  config: SmashConfig;
}

/** Static hosting for the Expo web export: private S3 bucket behind CloudFront with SPA fallback. */
export class WebStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  /** https URL of the web app (custom domain when configured, else the CloudFront domain). */
  readonly webUrl: string;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const { config } = props;
    const isProd = config.env === 'prod';

    this.bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `smash-${config.env}-web-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    const certificate = this.resolveCertificate(config);

    const responseHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `BadmintonSmash web (${config.env})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: responseHeaders,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...(config.domain && certificate
        ? { domainNames: [config.domain], certificate, minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021 }
        : {}),
    });

    if (config.domain && config.hostedZoneId && config.hostedZoneName) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: config.hostedZoneId,
        zoneName: config.hostedZoneName,
      });
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution));
      new route53.ARecord(this, 'AliasA', { zone, recordName: config.domain, target });
      new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: config.domain, target });
    }

    this.webUrl = config.domain ? `https://${config.domain}` : `https://${this.distribution.distributionDomainName}`;

    new CfnOutput(this, 'WebBucketName', { value: this.bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new CfnOutput(this, 'WebUrl', { value: this.webUrl });
  }

  /**
   * CloudFront certificates must live in us-east-1. When this stack is in us-east-1 we can create
   * one with DNS validation; otherwise the deployer passes `-c certificateArn=` for a certificate
   * they created in us-east-1.
   */
  private resolveCertificate(config: SmashConfig): acm.ICertificate | undefined {
    if (!config.domain) return undefined;
    if (config.certificateArn) {
      return acm.Certificate.fromCertificateArn(this, 'Certificate', config.certificateArn);
    }
    if (this.region === 'us-east-1' && config.hostedZoneId && config.hostedZoneName) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'CertZone', {
        hostedZoneId: config.hostedZoneId,
        zoneName: config.hostedZoneName,
      });
      return new acm.Certificate(this, 'Certificate', {
        domainName: config.domain,
        validation: acm.CertificateValidation.fromDns(zone),
      });
    }
    throw new Error(
      `Custom domain ${config.domain} needs -c certificateArn=<ACM certificate ARN in us-east-1> ` +
        '(or deploy the Web stack in us-east-1 with -c hostedZoneId= and -c hostedZoneName=).',
    );
  }
}
