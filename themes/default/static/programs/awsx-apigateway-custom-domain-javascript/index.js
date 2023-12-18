const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");
const apigateway = require("@pulumi/aws-apigateway");

const hostedZoneName = "example.com";
const domainName = `myapp.${hostedZoneName}`;

// Look up your existing Route 53 hosted zone.
const zone = aws.route53.getZoneOutput({ name: hostedZoneName });

const usEast1 = new aws.Provider("us-east-1", {
    region: "us-east-1",
});

// Provision a new ACM certificate.
const certificate = new aws.acm.Certificate(
    "certificate",
    {
        domainName: domainName,
        validationMethod: "DNS",
    },
    { provider: usEast1 },
);

// Validate the ACM certificate with DNS.
const validationOption = certificate.domainValidationOptions[0];
const validationRecord = new aws.route53.Record("certificate-validation-record", {
    name: validationOption.resourceRecordName,
    type: validationOption.resourceRecordType,
    records: [validationOption.resourceRecordValue],
    zoneId: zone.zoneId,
    ttl: 60,
});

const validation = new aws.acm.CertificateValidation(
    "certificate-validation",
    {
        certificateArn: certificate.arn,
        validationRecordFqdns: [validationRecord.fqdn],
    },
    { provider: usEast1 },
);

const api = new apigateway.RestAPI("api", {
    routes: [
        {
            path: "/",
            localPath: "www",
        },
    ],
});

const gatewayDomainName = new aws.apigateway.DomainName(
    "gateway-domain-name",
    {
        certificateArn: certificate.arn,
        domainName,
    },
    { dependsOn: validation },
);

const gatewayDNSRecord = new aws.route53.Record("gateway-dns-record", {
    zoneId: zone.zoneId,
    type: "A",
    name: domainName,
    aliases: [
        {
            name: gatewayDomainName.cloudfrontDomainName,
            zoneId: gatewayDomainName.cloudfrontZoneId,
            evaluateTargetHealth: false,
        },
    ],
});

const basePathMapping = new aws.apigateway.BasePathMapping("gateway-path-mapping", {
    restApi: api.api.id,
    stageName: api.stage.stageName,
    domainName: gatewayDomainName.domainName,
});

exports.url = pulumi.interpolate`https://${basePathMapping.domainName}`;
