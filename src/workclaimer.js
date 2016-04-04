let assert  = require('assert');
let _       = require('lodash');
let Promise = require('promise');
let events  = require('events');

/**
 * HintPoller polls for hints for pending tasks.
 *
 * The azure queues don't know if a task is pending they just store hints of
 * pending tasks. To be understood this way:
 *  A) If a task is pending, there is a hint of the task in an azure queue,
 *  B) If there is an hint in an azure queue, it may or may not be pending.
 *
 * It's an if, but not an only-if (think over-approximation).
 */
class HintPoller {
  constructor(parent, key) {
    this.parent = parent;
    this.key = key;
    this.requests = [];
    this.started = false;
  }

  requestClaim(count, aborted) {
    // Make a request for count tasks
    let request = null;
    let result = new Promise(resolve => request = {resolve, count});
    this.requests.push(request);

    aborted.then(() => {
      // Remove request from requests, and resolve request empty array
      _.remove(this.requests, request);
      request.resolve([]);
    });

    if (!this.started) {
      this.start();
    }

    return result;
  }

  start() {
    this.started = true;
    this.poll().catch(err => this.parent.emit('error', err));
  }

  async poll() {
    let count = 0;
    while ((count = _.sumBy(this.requests, 'count')) > 0) {

      let queues = this.owner.queueService.pendingQueues(
        provisionerId, workerType,
      );
      for (let queue of queues) {
        let hints = [];
        while (count > 0 && (hints = await queue.poll(count)).length > 0) {
          count -= hints.length;
          this.claimHint
        }
      }

    }

    this.destroy();
  }

  destroy() {
    // Remove entry from parent, and clear any timeouts
    delete this.parent._pending[key];
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }
}

/** WorkClaimer manages to claim work from azure queues. */
class WorkClaimer extends events.EventEmitter {
  /**
   * Create a new WorkClaimer.
   *
   * options:
   * {
   *   publisher:
   *   Task:
   *   queueService:
   * }
   */
  constructor(options) {
    assert(options);
    assert(options.publisher);
    assert(options.Task);
    assert(options.queueService);
    super();
    this._publisher = options.publisher;
    this._Task = options.Task;
    this._queueService = options.queueService;
    this._hintPollers = {}; // provisionerId/workerType -> HintPoller
  }

  async claim(provisionerId, workerType, count, aborted) {
    let claims = [];
    let done = false;
    aborted.then(() => done = true);
    // As soon as we have claims we return so work can get started.
    // We don't try to claim up to the count, that could take time and we risk
    // dropping the claims in case of server crash.
    while(claims.length === 0 && !done) {
      // Get a HintPoller
      let key = provisionerId + '/' + workerType;
      let hintPoller = this._pollers[key];
      if (!hintPoller) {
        this._hintPollers[key] = hintPoller = new HintPoller(this, key);
      }

      // Poll for hints (azure messages saying a task may be pending)
      let hints = await hintPoller.poll(count, aborted);

      claims = await Promise.all(hints.map(async(hint) => {
        try {
          return await this.claimTask(hint)
        } catch (err) {
          this.emit('error', err);
        }
        return null;
      }));

      // Remove entries from promises resolved as null (because of error)
      claims = claims.filter(claim => claim !== null);
    }
    return claims;
  }

  async claimTask(hint) {
    // See: queue.claimTask in api.js (preserve ordering of operations!)
  }
}

// Export WorkClaimer
module.exports = WorkClaimer;