suite('worker-types', () => {
  var debug       = require('debug')('test:workerType');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  setup(async function() {
    let WorkerType = await helper.load('WorkerType', helper.loadOptions);

    await WorkerType.scan({}, {handler: w => w.remove()});
  });

  test('queue.listWorkerTypes returns workerTypes', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);
    const workerType = slugid.v4();

    await WorkerType.create({provisionerId: 'prov-A', workerType}, true);

    let result = await helper.queue.listWorkerTypes('prov-A');

    assert(result.workerTypes.length === 1, 'expected workerTypes');
    assert(result.workerTypes[0] === workerType, `expected ${workerType}`);
  });

  test('list worker-types (limit and continuationToken)', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);

    await WorkerType.create({provisionerId: 'prov-A', workerType: slugid.v4()});
    await WorkerType.create({provisionerId: 'prov-A', workerType: slugid.v4()});

    let result = await helper.queue.listWorkerTypes('prov-A', {limit: 1});

    assert(result.continuationToken);
    assert(result.workerTypes.length === 1);

    result = await helper.queue.listWorkerTypes('prov-A', {
      limit: 1,
      continuationToken: result.continuationToken,
    });

    assert(!result.continuationToken);
    assert(result.workerTypes.length === 1);
  });

  test('list worker-types -- doesn\'t exist', async () => {
    await helper.queue.listWorkerTypes('no-provisioner').then(
      ()  => assert(false, 'Expected an error'),
      err => assert(err.code === 'ResourceNotFound', 'err != ResourceNotFound'),
    );
  });
});
