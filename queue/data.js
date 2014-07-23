var base    = require('taskcluster-base');
var debug   = require('debug')('queue:data');
var assert  = require('assert');

/** Azure table storage item for tracking an artifact */
var Artifact = base.Entity.configure({
  mapping: [
    {
      key:      'PartitionKey',
      property: 'taskIdSlashRunId',
      type:     'encodedstring'
    }, {
      key:      'RowKey',
      property: 'name',
      type:     'encodedstring'
    }, {
      key:      'version',
      type:     'number'
    }, {
      key:      'kind',
      type:     'string'
    }, {
      key:      'contentType',
      type:     'string'
    }, {
      key:      'details',
      type:     'json'
    }, {
      key:      'expires',
      type:     'date'
    }
  ]
});

/** Define auxiliary property to read `taskId` from `taskIdSlashRunId` */
Object.defineProperty(Artifact.prototype, 'taskId', {
  enumerable: true,
  get: function() { return this.taskIdSlashRunId.split('/')[0]; }
});

/** Define auxiliary property to read `runId` from `taskIdSlashRunId` */
Object.defineProperty(Artifact.prototype, 'runId', {
  enumerable: true,
  get: function() { return parseInt(this.taskIdSlashRunId.split('/')[1]); }
});

/** Overwrite create to construct taskIdSlashRunId */
Artifact.create = function(properties) {
  assert(properties.taskId  !== undefined, "can't create without taskId");
  assert(properties.runId   !== undefined, "can't create without runId");
  properties.taskIdSlashRunId = properties.taskId + '/' + properties.runId;
  delete properties.taskId;
  delete properties.runId;
  return base.Entity.create.call(this, properties);
};

/** Overwrite load to construct taskIdSlashRunId */
Artifact.load = function(taskId, runId, name) {
  return base.Entity.load.call(this, taskId + '/' + runId, name);
};

/** List all artifacts  for a given `taskId` and `runId` */
Artifact.list = function(taskId, runId) {
  return base.Entity.queryPartitionKey.call(this, taskId + '/' + runId);
};

/**
 * Expire artifacts that are past their expiration.
 *
 * options:
 * {
 *   artifactBucket:     // Bucket for S3 artifact storage
 *   artifactStore:      // BlobStore for Azure blob artifact storage
 * }
 *
 * Returns a promise that all expired artifacts have been deleted
 */
Artifact.expireEntities = function(options) {
  return base.Entity.QueryProperty(
    'expires', '<=', new Date(),
    function(artifact) {
      // Promise that we're ready to delete the artifact
      var ready = Promise.resolve(null);

      // Handle S3 artifacts
      if (artifact.kind === 's3') {
        ready = options.artifactBucket.deleteObject(artifact.prefix);
      }

      // Handle azure artifacts
      if (artifact.kind === 'azure') {

      }

      return ready.then(function() {
        return artifact.remove();
      });
  });
};

// Export Artifact
exports.Artifact = Artifact;
