suite('Post artifacts', function() {
  var debug         = require('debug')('test:api:claim');
  var assert        = require('assert');
  var slugid        = require('slugid');
  var _             = require('lodash');
  var Promise       = require('promise');
  var request       = require('superagent-promise');
  var assert        = require('assert');
  var urljoin       = require('url-join');
  var BlobUploader  = require('../queue/azure-blob-uploader-sas');
  var helper        = require('./helper');
  var subject       = helper.setup({title: "create task"});

  // Create datetime for created and deadline as 3 days later
  var created = new Date();
  var deadline = new Date();
  deadline.setDate(created.getDate() + 3);

  // Use the same task definition for everything
  var taskDef = {
    version:          '0.2.0',
    provisionerId:    'my-provisioner',
    workerType:       'my-worker',
    routing:          "jonasfj-test.what-a-hack",
    timeout:          30,
    retries:          5,
    priority:         1,
    created:          created.toJSON(),
    deadline:         deadline.toJSON(),
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    },
    tags: {
      purpose:        'taskcluster-testing'
    }
  };

  test("Post S3 artifact", function() {
    this.timeout(45000);

    var taskId = slugid.v4();
    debug("### Creating task");
    return subject.queue.createTask(taskId, taskDef).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Send post artifact request");
      return subject.queue.createArtifact(taskId, 0, 'public/s3.json', {
        kind:         's3',
        expires:      deadline.toJSON(),
        contentType:  'application/json'
      });
    }).then(function(result) {
      assert(result.putUrl, "Missing putUrl");
      debug("### Uploading to putUrl");
      return request
                .put(result.putUrl)
                .send({message: "Hello World"})
                .end();
    }).then(function() {
      /*debug("### Get artifact from queue");
      var name = 'public/s3.json';
      return subject.queue.getArtifactFromRun(taskId, 0, name);
    }).then(function(artifact) {
      assert(artifact.message === 'Hello World', "Got wrong message");*/
    }).then(function() {
      var name = 'public/s3.json';
      var url = urljoin(
        subject.baseUrl,
        'task',       taskId,
        'runs',       0,
        'artifacts',  name
      );
      debug("Fetching artifact from: %s", url);
      return request
                .get(url)
                .end().then(function(res) {
        assert(res.ok, "Request failed");
        assert(res.body.message === 'Hello World', "Got wrong message");
      });
    }).then(function() {
      var name = 'public/s3.json';
      var url = urljoin(
        subject.baseUrl,
        'task',       taskId,
        'artifacts',  name
      );
      debug("Fetching artifact from: %s", url);
      return request
                .get(url)
                .end().then(function(res) {
        assert(res.ok, "Request failed");
        assert(res.body.message === 'Hello World', "Got wrong message");
      });
    }).then(function() {
      debug("### List artifacts");
      return subject.queue.getArtifactsFromRun(taskId, 0);
    }).then(function(result) {
      assert(result.artifacts.length == 1, "Wrong length");
    }).then(function() {
      debug("### List artifacts from latest run");
      return subject.queue.getLatestArtifacts(taskId);
    }).then(function(result) {
      assert(result.artifacts.length == 1, "Wrong length");
    });
  });

  test("Post Azure artifact", function() {
    this.timeout(45000);
    var taskId = slugid.v4();
    debug("### Creating task");
    return subject.queue.createTask(taskId, taskDef).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Send post artifact request");
      return subject.queue.createArtifact(taskId, 0, 'public/azure.json', {
        kind:         'azure',
        expires:      deadline.toJSON(),
        contentType:  'application/json'
      });
    }).then(function(result) {
      var block1 = slugid.v4();
      var block2 = slugid.v4();

      debug("### Uploading first block");
      var uploader = new BlobUploader(result.sas);
      return Promise.all(
        uploader.putBlock(block1, '{"block1_says": "Hello world",\n'),
        uploader.putBlock(block2, '"block2_says": "Hello Again"}\n')
      ).then(function() {
        return uploader.putBlockList([block1, block2], 'application/json');
      });
    }).then(function() {
      var name = 'public/azure.json';
      var url = urljoin(
        subject.baseUrl,
        'task',       taskId,
        'artifacts',  name
      );
      debug("Fetching artifact from: %s", url);
      return request
                .get(url)
                .end().then(function(res) {
        assert(res.ok, "Request failed");
        assert(res.body.block1_says === 'Hello world', "Got wrong message");
      });
    });
  });

  test("Post error artifact", function() {
    this.timeout(45000);
    var taskId = slugid.v4();
    debug("### Creating task");
    return subject.queue.createTask(taskId, taskDef).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Send post artifact request");
      return subject.queue.createArtifact(taskId, 0, 'public/error.json', {
        kind:         'error',
        expires:      deadline.toJSON(),
        reason:       'file-missing-on-worker',
        message:      "Some user-defined message",
      });
    }).then(function() {
      var name = 'public/error.json';
      var url = urljoin(
        subject.baseUrl,
        'task',       taskId,
        'runs',       0,
        'artifacts',  name
      );
      debug("Fetching artifact from: %s", url);
      return request
                .get(url)
                .end().then(function(res) {
        assert(!res.ok, "Request failed");
        assert(res.status = 403, "Didn't get 403");
        assert(res.body.message === 'Some user-defined message',
               "Got wrong message");
      });
    });
  });

  test("Post redirect artifact", function() {
    this.timeout(45000);
    var taskId = slugid.v4();
    debug("### Creating task");
    return subject.queue.createTask(taskId, taskDef).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Send post artifact request");
      return subject.queue.createArtifact(taskId, 0, 'public/redirect.json', {
        kind:         'redirect',
        expires:      deadline.toJSON(),
        url:          'https://google.com',
        contentType:  'text/html'
      });
    }).then(function() {
      var name = 'public/redirect.json';
      var url = urljoin(
        subject.baseUrl,
        'task',       taskId,
        'runs',       0,
        'artifacts',  name
      );
      debug("Fetching artifact from: %s", url);
      return request
                .get(url)
                .end().then(function(res) {
        assert(res.text, "Didn't get a text from google.com?");
      });
    });
  });
});