suite('Test reruns', function() {
  var LocalQueue = require('../localqueue');
  var debug      = require('debug')('rerun_test');
  var assert      = require('assert');

  var queue = null;
  setup(function() {
    queue = new LocalQueue();
    return queue.launch();
  });

  teardown(function() {
    queue.terminate();
  });


  test('test reruns', function() {
    debug("Starting test");
    assert(true);
    debug("Ending test");
  });

});




