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
  constructor(parent, provisionerId, workerType) {
    this.parent = parent;
    this.provisionerId = provisionerId;
    this.workerType = workerType;
    this.requests = [];
    this.started = false;
  }

  requestClaim(count, aborted) {
    // Make a request for count tasks
    let request = null;
    let result = new Promise(resolve => request = {resolve, reject, count});
    this.requests.push(request);

    aborted.then(() => {
      // Remove request from requests, and resolve request empty array
      _.remove(this.requests, request);
      request.resolve([]);
    });

    this.start();

    return result;
  }

  start() {
    if (!this.started) {
      this.started = true;
      this.poll().catch(err => {
        this.started = false;
        // Resolve everything as failed
        this.destroy()
        let requests = this.requests;
        this.requests = [];
        requests.map(r => r.reject(err));
      }).catch(err => {
        process.nextTick(() => this.parent.emit('error', err));
      });
    }
  }

  async poll() {
    // Get queue objects for pending queues (ordered by priority)
    let queues = await this.owner.queueService.pendingQueues(
      this.provisionerId, this.workerType,
    );
    // While we have requests for hints
    while (_.sumBy(this.requests, 'count') > 0) {
      let claimed = 0; // Count hints claimed

      // In-order of queues, we claim hints from queues
      for (let queue of queues) {
        // While limit of hints requested is greater zero, and we are getting
        // hints from the queue we continue to claim from this queue
        let limit, hints;
        let i = 10; // count iterations a limit to 10, before we start over
        while ((limit = _.sumBy(this.requests, 'count')) > 0 &&
               (hints = await queue.poll(limit)).length > 0 && i-- > 0) {
          // Count hints claimed
          claimed += hints.length;

          // While we have hints and requests for hints we resolve requests
          while (hints.length > 0 && this.requests.length > 0) {
            let {resolve, count} = this.requests.shift();
            resolve(hints.splice(0, count));
          }

          // Release remaining hints (this shouldn't happen often!)
          await Promise.all(hints.map(hint => hint.release()));
          this.parent._monitor.count('hints-released', hints.length);
        }
      }

      // If nothing was claimed, we sleep 200ms before polling again
      this.parent._monitor.count('hint-poller-claimed', claimed);
      if (claimed === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        this.parent._monitor.count('hint-poller-sleep', 1);
      }
    }

    // No more requests, let's clean-up
    this.destroy();
  }

  destroy() {
    // Remove entry from parent
    delete this.parent._pending[this.provisionerId + '/' + this.workerType];
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
   *   monitor:
   * }
   */
  constructor(options) {
    assert(options);
    assert(options.publisher);
    assert(options.Task);
    assert(options.queueService);
    assert(options.monitor);
    super();
    this._monitor = monitor;
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
      let hintPoller = this._hintPollers[key];
      if (!hintPoller) {
        this._hintPollers[key] = hintPoller = new HintPoller(this, provisionerId, workerType);
      }

      // Poll for hints (azure messages saying a task may be pending)
      let hints = await hintPoller.requestClaim(count, aborted);

      // Try to claim all the hints
      claims = await Promise.all(hints.map(async(hint) => {
        try {
          return await this.claimTask(hint)
        } catch (err) {
          this._monitor.reportError(err, 'warning', {
            comment: 'claimTask from hint failed',
          });
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

    // remove hint when we're done
    hint.remove().catch(err => {
      this._monitor.reportError(err, 'warning', {
        comment: 'hint.remove() in claimTask -- error ignored',
      });
    });

    // Return null, if we couldn't claim the task
    return null;
  }
}

// Export WorkClaimer
module.exports = WorkClaimer;
