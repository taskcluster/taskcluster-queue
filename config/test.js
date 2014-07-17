module.exports = {
  queue: {
    publishMetaData:              'false',
    reaper: {
      // Let's not wait too long for reaping during tests
      interval:                   10,
      // Don't want to see error
      errorLimit:                 0
    },
    artifactBucket:               'test-bucket-for-any-garbage',
    logContainer:                 'logs',
    taskContainer:                'tasks'
  },

  taskcluster: {
    authBaseUrl:                  'http://localhost:1207/v1',

    credentials: {
      clientId:                   "test-server",
      accessToken:                "none"
    }
  },

  server: {
    publicUrl:                    'http://localhost:1208',
    port:                         1208
  },

  // Local database
  database: {
    connectionString:             'postgres://queue:secret@localhost:5432/queue_v1',
  },

  // Use local AMQP installation
  amqp: {
    url:                          'amqp://guest:guest@localhost:5672'
  },

  aws: {
    region:                       'us-west-2'
  }
};
