var base  = require('taskcluster-base');
var debug = require('debug')('queue:data');

/** Azure table storage item for tracking a resource */
var Resource = base.Entity.configure({
  mapping: [
    {
      key:      'PartitionKey',
      property: 'taskIdSlashRunId',
      type:     'string'
    }, {
      key:      'RowKey',
      property: 'name',
      type:     'string'
    }, {
      key:      'version',
      property: 'version',
      type:     'number'
    }, {
      key:      'kind',
      property: 'kind',
      type:     'string'
    }, {
      key:      'info',
      property: 'info',
      type:     'json'
    }, {
      key:      'expires',
      property: 'expires',
      type:     'date'
    }
  ]
});

/** Define auxiliary property to read `taskId` from `taskIdSlashRunId` */
Object.defineProperty(Resource.prototype, 'taskId', {
  enumerable: true,
  get: function() { return this.taskIdSlashRunId.split('/')[0]; }
});

/** Define auxiliary property to read `runId` from `taskIdSlashRunId` */
Object.defineProperty(Resource.prototype, 'runId', {
  enumerable: true,
  get: function() { return parseInt(this.taskIdSlashRunId.split('/')[1]); }
});

/** Overwrite create to construct taskIdSlashRunId */
Resource.create = function(properties) {
  assert(properties.taskId  !== undefined, "can't create without taskId");
  assert(properties.runId   !== undefined, "can't create without runId");
  properties.taskIdSlashRunId = properties.taskId + '/' + properties.runId;
  delete properties.taskId;
  delete properties.runId;
  return base.Entity.create.call(this, properties);
};

// Export Log
exports.Log = Resource.configure({});

// Export Artifact
exports.Artifact = Artifact.configure({});
