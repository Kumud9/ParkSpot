// In-process keyed async mutex to serialize concurrent booking operations on the same parking slot
class KeyedMutex {
  constructor() {
    this.locks = new Map();
  }

  async acquire(key) {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    this.locks.set(key, promise);
    return () => {
      this.locks.delete(key);
      release();
    };
  }

  async withLock(key, fn) {
    const release = await this.acquire(key);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

const slotMutex = new KeyedMutex();

module.exports = { KeyedMutex, slotMutex };
