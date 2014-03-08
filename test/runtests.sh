#! /bin/bash -vex

# These can safely be run in all cases
./node_modules/.bin/nodeunit  \
  test/validate_test.js \
  test/events_test.js
 # test/data_test.js (disabled as it doesn't work reliably)

if [ "$AWS_ACCESS_KEY_ID" == '' ] ;
then
  echo "Skipping running test that require s3";
else
  echo "Running tests which require s3 credentials"

  DEBUG=* ./node_modules/.bin/mocha test/api/rerun_test.js

  DEBUG=* ./node_modules/.bin/mocha             \
    test/api/claim_timeout.js           \
    test/api/define_schedule_task.js    \
    test/api/post_task.js               \
    test/api/rerun_test.js
fi
