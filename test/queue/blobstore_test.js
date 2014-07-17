suite('queue/tasks_store', function() {
  var Promise   = require('promise');
  var slugid    = require('slugid');
  var assert    = require('assert');
  var BlobStore = require('../../queue/blobstore');
  var base      = require('taskcluster-base');
  var _         = require('lodash');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + 'test'),
    filename:     'taskcluster-queue'
  });

  // Check that we have an account
  if (!cfg.get('azureBlob:accountKey')) {
    console.log("\nWARNING:");
    console.log("Skipping 'blobstore' tests, missing config file: " +
                "taskcluster-queue.conf.json");
    return;
  }

  var blobstore = new BlobStore({
    container:    'test-container',
    credentials:  cfg.get('azureBlob')
  });

  // Create container
  test("createContainer", function() {
    return blobstore.createContainer();
  });

  // Test that put works
  test("put", function() {
    var key  = slugid.v4();
    var data = {message: "Hello World", list: [1, 2, 3]};
    return blobstore.put(key, data).then(function() {
      return blobstore.put(key, {message: "Go away"});
    }).then(function() {
      return blobstore.get(key);
    }).then(function(result) {
      assert(result.message == 'Go away', "Message mismatch!");
    });
  });

  // Put if not exists
  test("putIfNotExists", function() {
    var key  = slugid.v4();
    var data = {message: "Hello World", list: [1, 2, 3]};
    return blobstore.putIfNotExists(key, data).then(function() {
      return blobstore.putIfNotExists(key, data);
    }).then(function() {
      assert(false, "Expected error");
    }).catch(function(err) {
      assert(err.code === 'BlobAlreadyExists', "Should already exist");
    });
  });

  // Test that we can get values
  test("get", function() {
    var key  = slugid.v4();
    var data = {message: "Hello World", list: [1, 2, 3]};
    return blobstore.putIfNotExists(key, data).then(function() {
      return blobstore.get(key);
    }).then(function(result) {
      assert(_.isEqual(result, data), "Unexpected result");
    });
  });

  // Test that put if not match
  test("putIfNotMatch (match)", function() {
    var key  = slugid.v4();
    var data = {message: "Hello World", list: [1, 2, 3]};
    return blobstore.putIfNotMatch(key, data).then(function() {
      return blobstore.putIfNotMatch(key, data);
    });
  });

  // Test that put if not match
  test("putIfNotMatch (mismatch)", function() {
    var key  = slugid.v4();
    var data = {message: "Hello World", list: [1, 2, 3]};
    return blobstore.putIfNotMatch(key, data).then(function() {
      return blobstore.putIfNotMatch(key, {message: "Go away"});
    }).then(function() {
      assert(false, "Expected error");
    }).catch(function(err) {
      assert(err.code === 'BlobAlreadyExists', "Should already exist");
    });
  });

  // Test that we can't key that doesn't exists
  test("get with nullIfNotFound", function() {
    var key  = slugid.v4();
    var data = {message: "Hello World", list: [1, 2, 3]};
    return blobstore.get(key, true).then(function(result) {
      assert(result === null, "Unexpected result");
    });
  });

  // Test that we can't key that doesn't exists
  test("get without nullIfNotFound", function() {
    var key  = slugid.v4();
    var data = {message: "Hello World", list: [1, 2, 3]};
    return blobstore.get(key).then(function(result) {
      assert(false, "Expected Error");
    }).catch(function(err) {
      assert(err.code === 'BlobNotFound', "Expected not found error");
    });
  });
});
