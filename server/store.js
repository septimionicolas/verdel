import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function createStore(events, persist, clock) {
  return {
    events,
    append(event) {
      const stored = { sequence: events.length + 1, at: clock().toISOString(), ...event };
      persist(stored);
      events.push(stored);
      return stored;
    },
  };
}

export function openEventStore(dataDir, clock = () => new Date()) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'events.jsonl');
  const events = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
  return createStore(events, (stored) => appendFileSync(file, `${JSON.stringify(stored)}\n`), clock);
}

export function memoryEventStore(clock = () => new Date()) {
  return createStore([], () => {}, clock);
}
