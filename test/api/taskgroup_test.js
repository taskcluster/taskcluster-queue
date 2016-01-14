suite('TaskGroup features', () => {
  var debug       = require('debug')('test:api:taskGroup');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'dummy-scheduler',
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    }
  };

  test("Create two tasks", async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    await helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
      taskId:   taskIdA
    }));
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId:   taskIdA
    }));

    debug("### Creating taskA");
    helper.scopes(
      'queue:define-task:no-provisioner/test-worker',
      'queue:task-group-id:dummy-scheduler/' + taskGroupId,
      'queue:schedule-task:dummy-scheduler/' + taskGroupId + '/' + taskIdA,
    );
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug("### Creating taskB");
    let taskIdB = slugid.v4();
    helper.scopes(
      'queue:define-task:no-provisioner/test-worker',
      'queue:task-group-id:dummy-scheduler/' + taskGroupId,
      'queue:schedule-task:dummy-scheduler/' + taskGroupId + '/' + taskIdB,
    );
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
    }, taskDef));

    debug("### Listening for task-defined for taskA");
    var m1 = await helper.events.waitFor('is-defined');
    assume(r1.status).deep.equals(m1.payload.status);

    // Wait for task-pending message for taskA
    var m2 = await helper.events.waitFor('is-pending');
    assume(m2.payload.status).deep.equals(m2.payload.status);

    // Check taskA status
    var r2 = await helper.queue.status(taskIdA);
    assume(r1.status).deep.equals(r2.status);
  });

  test("schedulerId is fixed per taskGroupId", async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    helper.scopes(
      'queue:define-task:no-provisioner/test-worker',
      'queue:task-group-id:*',
      'queue:schedule-task:*',
    );

    debug("### Creating taskA");
    await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-1',
    }, taskDef));

    debug("### Creating taskB");
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-2',
    }, taskDef)).then(() => {assert(false, 'expected an error')}, err => {
      assert(err.statusCode === 409, 'Expected a 409 error');
    });
  });

  test("list task-group", async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug("### Creating taskA");
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug("### Creating taskB");
    let taskIdB = slugid.v4();
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(_.includes(result.members, taskIdA));
    assert(_.includes(result.members, taskIdB));
    assert(result.taskGroupId === taskGroupId);
  });

  test("list task-group (limit and continuationToken)", async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug("### Creating taskA");
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug("### Creating taskB");
    let taskIdB = slugid.v4();
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId, {
      limit: 1,
    });
    assert(result.continuationToken);
    assert(_.includes(result.members, taskIdA) ||
           _.includes(result.members, taskIdB));
    assert(result.taskGroupId === taskGroupId);

    result = await helper.queue.listTaskGroup(taskGroupId, {
      limit: 1,
      continuationToken: result.continuationToken,
    });
    assert(!result.continuationToken);
    assert(_.includes(result.members, taskIdA) ||
           _.includes(result.members, taskIdB));
    assert(result.taskGroupId === taskGroupId);
  });

  test("list task-group -- that is empty / doesn't exist", async () => {
    let result = await helper.queue.listTaskGroup(slugid.v4());
    assert(!result.continuationToken);
    assert(result.members.length === 0);
  });
});