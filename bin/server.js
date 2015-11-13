#!/usr/bin/env node
var debug             = require('debug')('queue:bin:server');
var base              = require('taskcluster-base');
var v1                = require('../routes/v1');
var path              = require('path');
var Promise           = require('promise');
var exchanges         = require('../queue/exchanges');
var _                 = require('lodash');
var BlobStore         = require('../queue/blobstore');
var data              = require('../queue/data');
var Bucket            = require('../queue/bucket');
var QueueService      = require('../queue/queueservice');
var EC2RegionResolver = require('../queue/ec2regionresolver');
var legacyConfig      = require('taskcluster-lib-config');

/** Launch server */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  let cfg = base.config({profile});

  // Create InfluxDB connection for submitting statistics
  var influx = new base.stats.Influx(cfg.influx);

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      influx,
    component:  cfg.app.statsComponent,
    process:    'server'
  });

  // Create artifact bucket instances
  var publicArtifactBucket = new Bucket({
    bucket:             cfg.app.publicArtifactBucket,
    credentials:        cfg.aws,
    bucketCDN:          cfg.app.publicArtifactBucketCDN,
  });
  var privateArtifactBucket = new Bucket({
    bucket:             cfg.app.privateArtifactBucket,
    credentials:        cfg.aws
  });

  // Create artifactStore
  var artifactStore = new BlobStore({
    container:          cfg.app.artifactContainer,
    credentials:        cfg.azure
  });

  // Create artifacts table
  var Artifact = data.Artifact.setup({
    table:              cfg.app.artifactTableName,
    credentials:        cfg.azure,
    context: {
      blobStore:        artifactStore,
      publicBucket:     publicArtifactBucket,
      privateBucket:    privateArtifactBucket
    },
    drain:              influx,
    component:          cfg.app.statsComponent,
    process:            'server'
  });

  // Create task table
  var Task = data.Task.setup({
    table:              cfg.app.taskTableName,
    credentials:        cfg.azure,
    drain:              influx,
    component:          cfg.app.statsComponent,
    process:            'server'
  });

  // Create QueueService to manage azure queues
  var queueService = new QueueService({
    prefix:           cfg.app.queuePrefix,
    credentials:      cfg.azure,
    claimQueue:       cfg.app.claimQueue,
    deadlineQueue:    cfg.app.deadlineQueue,
    deadlineDelay:    cfg.app.deadlineDelay
  });

  // Create EC2RegionResolver for regions we have artifact proxies in
  var regionResolver = new EC2RegionResolver(
    cfg.app.usePublicArtifactBucketProxy ?
      _.keys(cfg.app.publicArtifactBucketProxies)
    :
      []
  );

  // When: publisher, validator and containers are created, proceed
  debug("Waiting for resources to be created");
  var validator, publisher;
  await Promise.all([
    (async () => {
      validator = await base.validator({
        folder:           path.join(__dirname, '..', 'schemas'),
        constants:        require('../schemas/constants'),
        publish:          cfg.app.publishMetaData,
        schemaPrefix:     'queue/v1/',
        aws:              cfg.aws
      });

      publisher = await exchanges.setup({
        credentials:        cfg.pulse,
        exchangePrefix:     cfg.app.exchangePrefix,
        validator:          validator,
        referencePrefix:    'queue/v1/exchanges.json',
        publish:            cfg.app.publishMetaData,
        aws:                cfg.aws,
        drain:              influx,
        component:          cfg.app.statsComponent,
        process:            'server'
      });
    })(),
    (async () => {
      await artifactStore.createContainer();
      await artifactStore.setupCORS();
    })(),
    Task.ensureTable(),
    Artifact.ensureTable(),
    publicArtifactBucket.setupCORS(),
    privateArtifactBucket.setupCORS(),
    regionResolver.loadIpRanges()
  ]);

  // Create API router and publish reference if needed
  debug("Creating API router");

  var router = await v1.setup({
    context: {
      Task:           Task,
      Artifact:       Artifact,
      publisher:      publisher,
      validator:      validator,
      claimTimeout:   cfg.app.claimTimeout,
      queueService:   queueService,
      blobStore:      artifactStore,
      publicBucket:   publicArtifactBucket,
      privateBucket:  privateArtifactBucket,
      regionResolver: regionResolver,
      publicProxies:  cfg.app.publicArtifactBucketProxies,
      credentials:    cfg.taskcluster.credentials,
    },
    validator:        validator,
    authBaseUrl:      cfg.taskcluster.authBaseUrl,
    publish:          cfg.app.publishMetaData,
    baseUrl:          cfg.server.publicUrl + '/v1',
    referencePrefix:  'queue/v1/api.json',
    aws:              cfg.aws,
    component:        cfg.app.statsComponent,
    drain:            influx
  });

  debug("Configuring app");

  // Create app
  var app = base.app(cfg.server);

  // Mount API router
  app.use('/v1', router);

  // Create server
  debug("Launching server");
  return app.createServer();
};

// If server.js is executed start the server
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: server.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;