var azure   = require('azure');
var _       = require('lodash');
var Promise = require('promise');
var debug   = require('debug')('queue:blobstore');


/**
 * Create convenient azure blob storage wrapper.
 * options:
 * {
 *   container:            // Container name to use
 *   credentials: {
 *     accountName:        // Azure storage account name
 *     accountKey:         // Azure storage account key
 *   }
 * }
 */
var BlobStore = function(options) {
  this.container = options.container;
  this.service = new azure.BlobService(
    options.credentials.accountName,
    options.credentials.accountKey
  );
};

// Export BlobStore
module.exports = BlobStore;

/** Create blob-store container */
BlobStore.prototype.createContainer = function() {
  var that = this;
  return new Promise(function(accept, reject) {
    that.service.createContainerIfNotExists(that.container,
                                            function(err, created) {
      if (err) {
        return reject(err);
      }
      if (created) {
        debug("Container '%s' created", that.container);
      } else {
        debug("Container '%s' already exists", that.container);
      }
      return accept(created);
    });
  });
};


/** Put JSON object and overwrite existing blob */
BlobStore.prototype.put = function(key, json) {
  var that = this;
  return new Promise(function(accept, reject) {
    var payload = JSON.stringify(json);
    that.service.createBlockBlobFromText(that.container, key, payload, {
      contentType:      'application/json'
    }, function(err, result, response) {
      if (err) {
        return reject(err);
      }
      return accept(result);
    });
  });
};


/**
 * Put JSON object if it doesn't already exist
 *
 * Causes and error with `code` 'BlobAlreadyExists' if the blob already exists.
 */
BlobStore.prototype.putIfNotExists = function(key, json) {
  var that = this;
  return new Promise(function(accept, reject) {
    var payload = JSON.stringify(json);
    that.service.createBlockBlobFromText(that.container, key, payload, {
      contentType:      'application/json',
      accessConditions: {'if-none-match': '*'}
    }, function(err, result, response) {
      if (err) {
        return reject(err);
      }
      return accept(result);
    });
  });
};

/**
 * Put JSON if it doesn't match what is already there
 *
 * Causes an error, with `code` 'BlobAlreadyExists' if the blob already exists
 * and contains JSON different from what we're putting
 */
BlobStore.prototype.putIfNotMatch = function(key, json) {
  var that = this;
  return that.putIfNotExists(key, json).catch(function(err) {
    // Handle error if we're getting a warning that the blob already exists
    if (err.code != 'BlobAlreadyExists') {
      throw err;
    }
    return that.get(key).then(function(result) {
      if (!_.isEqual(result, json)) {
        throw err;
      }
    });
  });
};

/**
 * Load a blob as JSON, if it exists
 *
 * return null if it doesn't exists and `nullIfNotFound` is `true`.
 */
BlobStore.prototype.get = function(key, nullIfNotFound) {
  var that = this;
  return new Promise(function(accept, reject) {
    that.service.getBlobToText(that.container, key, function(err, result) {
      if (err) {
        if (nullIfNotFound && err.code === 'BlobNotFound') {
          return accept(null);
        }
        return reject(err);
      }
      return accept(JSON.parse(result));
    });
  });
};

