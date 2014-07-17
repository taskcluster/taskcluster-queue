#!/usr/bin/env node
var debug       = require('debug')('queue:bin:server');
var base        = require('taskcluster-base');
var v1          = require('../routes/api/v1');
var path        = require('path');
var Promise     = require('promise');
var exchanges   = require('../queue/exchanges');
var TaskModule  = require('../queue/task.js')
var aws         = require('aws-sdk-promise');
var _           = require('lodash');
var BlobStore   = require('../queue/blobstore');

/** Launch server */
var launch = function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'amqp_url',
      'database_connectionString',
      'queue_publishMetaData',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'queue_credentials_clientId',
      'queue_credentials_accessToken',
      'azureBlob_accountUrl',
      'azureBlob_accountName',
      'azureBlob_accountKey',
      'azureTable_accountUrl',
      'azureTable_accountName',
      'azureTable_accountKey'
    ],
    filename:     'taskcluster-queue'
  });


  // Setup AMQP exchanges and create a publisher
  // First create a validator and then publisher
  var validator = null;
  var publisher = null;
  var publisherCreated = base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    publish:          cfg.get('queue:publishMetaData') === 'true',
    schemaPrefix:     'queue/v1/',
    aws:              cfg.get('aws')
  }).then(function(validator_) {
    debug("Validator created");
    validator = validator_;
    return exchanges.setup({
      connectionString:   cfg.get('amqp:url'),
      exchangePrefix:     cfg.get('queue:exchangePrefix'),
      validator:          validator,
      referencePrefix:    'queue/v1/exchanges.json',
      publish:            cfg.get('queue:publishMetaData') === 'true',
      aws:                cfg.get('aws')
    });
  }).then(function(publisher_) {
    debug("Publisher created");
    publisher = publisher_;
  });

  // Create artifact bucket instance for API implementation
  var artifactBucket = new aws.S3(_.defaults({
    params: {
      Bucket:       cfg.get('queue:artifactBucket')
    }
  }, cfg.get('aws')));

  // Create taskstore and logstore
  var taskstore = new BlobStore({
    container:          cfg.get('queue:taskContainer'),
    credentials:        cfg.get('azureBlob')
  });
  var logstore  = new BlobStore({
    container:          cfg.get('queue:logContainer'),
    credentials:        cfg.get('azureBlob')
  });

  // Create Task subclass wrapping database access
  var Task = TaskModule.configure({
    connectionString:   cfg.get('database:connectionString')
  });

  // When: publisher, validator and containers are created, proceed
  debug("Waiting for resources to be created");
  return Promise.all(
    publisherCreated,
    taskstore.createContainer(),
    logstore.createContainer(),
    Task.ensureTables()
  ).then(function() {
    // Create API router and publish reference if needed
    debug("Creating API router");
    return v1.setup({
      context: {
        Task:           Task,
        taskstore:      taskstore,
        logstore:       logstore,
        artifactBucket: artifactBucket,
        publisher:      publisher,
        validator:      validator,
        Artifacts:      null, // To be implemented
        Logs:           null, // To be implemented
        cfg:            cfg   // To be deprecated and replaced with variables
      },
      validator:        validator,
      authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
      credentials:      cfg.get('taskcluster:credentials'),
      publish:          cfg.get('queue:publishMetaData') === 'true',
      baseUrl:          cfg.get('server:publicUrl') + '/v1',
      referencePrefix:  'queue/v1/api.json',
      aws:              cfg.get('aws')
    });
  }).then(function(router) {
    debug("Configuring app");

    // Create app
    var app = base.app({
      port:           Number(process.env.PORT || cfg.get('server:port'))
    });

    // Mount API router
    app.use('/v1', router);

    // Create server
    debug("Launching server");
    return app.createServer();
  });
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