suite('Rerun task', function() {
  var debug       = require('debug')('test:api:claim');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper');
  var subject     = helper.setup({title: "create task"});

  // Create datetime for created and deadline as 3 days later
  var created = new Date();
  var deadline = new Date();
  deadline.setDate(created.getDate() + 3);

  // Use the same task definition for everything
  var taskDef = {
    version:          '0.2.0',
    provisionerId:    'my-provisioner',
    workerType:       'my-worker',
    // let's just test a large routing key too, 128 chars please :)
    routing:          "jonasfj-test.what-a-hack.I suppose we might " +
                      "actually need it when we add taskgraph scheduler id, " +
                      "taskgraphId, task graph routing",
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

  test("create, claim, complete and rerun (is idempotent)", function() {
    var taskId = slugid.v4();
    var isPending = subject.listenFor(subject.queueEvents.taskPending({
      taskId:   taskId,
      runId:    0
    }));
    var isRunning = subject.listenFor(subject.queueEvents.taskRunning({
      taskId:   taskId
    }));
    var isCompleted = subject.listenFor(subject.queueEvents.taskCompleted({
      taskId:   taskId
    }));
    var isPendingAgain = subject.listenFor(subject.queueEvents.taskPending({
      taskId:   taskId,
      runId:    1
    }));

    debug("### Creating task");
    return subject.queue.createTask(taskId, taskDef).then(function() {
      debug("### Waiting for pending message");
      return isPending;
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Waiting for running message");
      return isRunning;
    }).then(function() {
      debug("### Reporting task completed");
      return subject.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    }).then(function() {
      debug("### Waiting for completed message");
      return isCompleted;
    }).then(function() {
      debug("### Requesting task rerun");
      return subject.queue.rerunTask(taskId);
    }).then(function() {
      debug("### Waiting for pending message again");
      return isPendingAgain;
    }).then(function() {
      debug("### Requesting task rerun (again)");
      return subject.queue.rerunTask(taskId);
    });
  });
});