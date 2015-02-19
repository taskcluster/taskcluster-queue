suite('queue/QueueService', function() {
  var Promise       = require('promise');
  var slugid        = require('slugid');
  var assert        = require('assert');
  var QueueService  = require('../../queue/queueservice');
  var base          = require('taskcluster-base');
  var _             = require('lodash');
  var url           = require('url');
  var request       = require('superagent-promise');
  var debug         = require('debug')('queue:test:queueservice');
  var xml2js        = require('xml2js');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + 'test'),
    envs: [
      'azure_accountName',
      'azure_accountKey',
    ],
    filename:     'taskcluster-queue'
  });

  // Check that we have an account
  if (!cfg.get('azure:accountKey')) {
    console.log("\nWARNING:");
    console.log("Skipping 'blobstore' tests, missing config file: " +
                "taskcluster-queue.conf.json");
    return;
  }

  var queueService = new QueueService({
    prefix:           cfg.get('queue:queuePrefix'),
    credentials:      cfg.get('azure')
  });

  var workerType = 'no-worker';

  // Create ensureQueue
  test("ensureQueue", function() {
    return queueService.ensureQueue(
      'no-provisioner',
      workerType
    ).then(function() {
      return queueService.ensureQueue('no-provisioner', workerType);
    });
  });

  // Test that putMessage works
  test("putMessage", function() {
    var deadline = new Date();
    deadline.setMinutes(deadline.getMinutes() + 10);
    return queueService.putMessage('no-provisioner', workerType, {
      message: "test",
      num:    34,
      text: "<lalal ></"
    }, deadline);
  });

  test("signedUrl", function() {
    return queueService.signedUrl(
      'no-provisioner',
      workerType
    );
  });

  test("putTask, getMessage, deleteMessage", function() {
    var deadline = new Date();
    deadline.setMinutes(deadline.getMinutes() + 5);
    var taskId = slugid.v4();
    return queueService.putTask(
      'no-provisioner',
      workerType + '1',
      taskId, 0,
      deadline
    ).then(function() {
      return queueService.signedUrl(
        'no-provisioner',
        workerType + '1'
      );
    }).then(function(urls) {
      return request
      .get(urls.getMessage)
      .buffer()
      .end()
      .then(function(res) {
        assert(res.ok, "Request failed!");
        return new Promise(function(accept, reject) {
          xml2js.parseString(res.text, function(err, json) {
            if (err) {
              return reject(err);
            }
            accept(json);
          });
        });
      }).then(function(json) {
        var msg = json.QueueMessagesList.QueueMessage[0];
        var payload = new Buffer(msg.MessageText[0], 'base64').toString();
        payload = JSON.parse(payload);
        assert(taskId === payload.taskId, "Got different taskId");

        var delUrl = urls.delMessage
             .replace('{{messageId}}', encodeURIComponent(msg.MessageId[0]))
             .replace('{{popReceipt}}', encodeURIComponent(msg.PopReceipt[0]));
        return request.del(delUrl).buffer().end().then(function(res) {
          if (!res.ok) {
            debug("Failed to delete message: %s", res.text);
            assert(false, "Failed to delete message");
          }
        });
      });
    });
  });

  test("signedUrl, getMessage from empty queue", function() {
    return queueService.signedUrl(
      'no-provisioner',
      workerType + '2'
    ).then(function(urls) {
      return request
      .get(urls.getMessage)
      .buffer()
      .end()
      .then(function(res) {
        assert(res.ok, "Request failed!");
        return new Promise(function(accept, reject) {
          xml2js.parseString(res.text, function(err, json) {
            if (err) {
              return reject(err);
            }
            accept(json);
          });
        });
      }).then(function(json) {
        assert(!(json.QueueMessagesList.QueueMessage instanceof Array),
               "didn't expect any results");
      });
    });
  });
});
