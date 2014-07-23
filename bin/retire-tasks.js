#!/usr/bin/env node
var debug       = require('debug')('queue:bin:retire-tasks');
var base        = require('taskcluster-base');
var path        = require('path');
var Promise     = require('promise');
var TaskModule  = require('../queue/task.js')
var _           = require('lodash');
var BlobStore   = require('../queue/blobstore');

/** Launch retire-tasks */
var launch = function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'database_connectionString',
      'azure_accountName',
      'azure_accountKey',
    ],
    filename:     'taskcluster-queue'
  });

  // Create taskstore
  var taskstore     = new BlobStore({
    container:          cfg.get('queue:taskContainer'),
    credentials:        cfg.get('azure')
  });

  // Create Task subclass wrapping database access
  var Task = TaskModule.configure({
    connectionString:   cfg.get('database:connectionString')
  });

  debug("Waiting for resources to be created");
  return Promise.all(
    taskstore.createContainer(),
    Task.ensureTables()
  ).then(function() {
    // Move old tasks from database
    var count = 0;
    return Task.moveTaskFromDatabase({
      store: function(task) {
        count += 1;
        debug("Move %s to blob storage", task.taskId);
        return taskstore.put(task.taskId + '/status.json', task.serialize());
      }
    });
  }).then(function() {
    debug("Retired %s old tasks to blob storage", count);

    // Notify parent process, so that this worker can run using LocalApp
    base.app.notifyLocalAppInParentProcess();

    // Shutdown
    return Task.close();
  });
};

// If move-tasks.js is executed run launch
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: move-tasks.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched move-tasks successfully");
  }).catch(function(err) {
    debug("Failed to start move-tasks, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the move-tasks we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;