'use strict';
/**
 * Presentation timer (js/ui/timer.js): the pure part - clock formatting, minutes parsing, the agenda budget computed
 * from config.talk, the schedule hints and the start/pause/reset state machine driven by an injected clock.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const T = require('../js/ui/timer.js');
const config = require('../js/config.js');

const sum = (items) => items.reduce((acc, item) => acc + item.seconds, 0);

/** A clock the test moves by hand. */
function fakeClock(start) {
  let t = start || 1000;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('timer: formatting and parsing', () => {
  it('formats the remaining time as mm:ss, counting a started second as a whole one', () => {
    assert.equal(T.formatClock(0), '00:00');
    assert.equal(T.formatClock(20 * 60000), '20:00');
    assert.equal(T.formatClock(59000), '00:59');
    assert.equal(T.formatClock(59001), '01:00');
    assert.equal(T.formatClock(1198500), '19:59');
    assert.equal(T.formatClock(100 * 60000), '100:00');
  });

  it('marks overtime with a minus sign and never shows "-00:00"', () => {
    assert.equal(T.formatClock(-30000), '−00:30');
    assert.equal(T.formatClock(-61000), '−01:01');
    assert.equal(T.formatClock(-400), '00:00');
  });

  it('writes durations in words for the agenda', () => {
    assert.equal(T.durationText(240), '4 min');
    assert.equal(T.durationText(225), '3 min 45 s');
    assert.equal(T.durationText(45), '45 s');
    assert.equal(T.durationText(0), '0 min');
  });

  it('parses the total minutes typed by the user (comma or dot), within 1..240', () => {
    assert.equal(T.parseMinutes('20'), 20);
    assert.equal(T.parseMinutes(' 7 '), 7);
    assert.equal(T.parseMinutes('15,4'), 15);
    assert.equal(T.parseMinutes('15.5'), 16);
    assert.equal(T.parseMinutes(30), 30);
    [0, '0', '241', '-5', 'abc', '', null, undefined, NaN, '1e9'].forEach((bad) => assert.ok(Number.isNaN(T.parseMinutes(bad)), String(bad)));
  });

  it('resolves the minutes: stored choice, then config, then the built-in default', () => {
    assert.equal(T.resolveMinutes(null, 20), 20);
    assert.equal(T.resolveMinutes(25, 20), 25);
    assert.equal(T.resolveMinutes('x', 18), 18);
    assert.equal(T.resolveMinutes(null, undefined), T.DEFAULT_MINUTES);
    assert.equal(T.resolveMinutes(null, config.talk.minutes), config.talk.minutes);
  });
});

describe('timer: agenda budget from config.talk', () => {
  it('splits the placeholder 20 minutes by the configured shares, in whole seconds that add up', () => {
    const p = T.plan(20, config.talk.agenda);
    assert.equal(p.totalSec, 1200);
    assert.equal(sum(p.items), 1200);
    assert.deepEqual(p.items.map((i) => i.id), config.talk.agenda.map((a) => a.id));
    assert.deepEqual(p.items.map((i) => i.seconds), [120, 300, 240, 240, 180, 120]);
  });

  it('keeps the windows contiguous from 0 to the total', () => {
    const p = T.plan(20, config.talk.agenda);
    assert.equal(p.items[0].startSec, 0);
    p.items.forEach((item, k) => {
      assert.equal(item.endSec - item.startSec, item.seconds);
      if (k > 0) assert.equal(item.startSec, p.items[k - 1].endSec);
    });
    assert.equal(p.items[p.items.length - 1].endSec, 1200);
    assert.equal(T.windowText(p.items[1]), '02:00–07:00');
  });

  it('adds up exactly for any edited length (largest remainder, each within one second of its share)', () => {
    [1, 7, 13, 15, 45, 240].forEach((minutes) => {
      const p = T.plan(minutes, config.talk.agenda);
      assert.equal(sum(p.items), minutes * 60, `${minutes} min`);
      p.items.forEach((item) => assert.ok(Math.abs(item.seconds - item.share * minutes * 60) < 1, `${minutes} min, ${item.id}`));
    });
  });

  it('normalizes shares that do not add up to 1 and ignores invalid entries', () => {
    const p = T.plan(10, [{ id: 'a', label: 'A', share: 2 }, { id: 'b', label: 'B', share: 2 }, { id: 'c', label: 'C', share: -1 }, null]);
    assert.deepEqual(p.items.map((i) => [i.id, i.seconds]), [['a', 300], ['b', 300]]);
    assert.deepEqual(T.plan(10, []).items, []);
  });

  it('finds the segment of a page, the planned segment at a time, and whether a section runs late', () => {
    const p = T.plan(20, config.talk.agenda);
    assert.equal(T.segmentOf(p, 'teoria').seconds, 300);
    assert.equal(T.segmentOf(p, 'fuentes'), null);
    assert.equal(T.expectedAt(p, 0).id, 'inicio');
    assert.equal(T.expectedAt(p, 130).id, 'teoria');
    assert.equal(T.expectedAt(p, 1199).id, 'audiencia');
    assert.equal(T.expectedAt(p, 1300), null);
    assert.equal(T.schedule(p, 'teoria', 60), 'ahead');
    assert.equal(T.schedule(p, 'teoria', 200), 'on');
    assert.equal(T.schedule(p, 'teoria', 500), 'late');
    assert.equal(T.schedule(p, 'fuentes', 500), 'none');
  });
});

describe('timer: phases and announcements', () => {
  const total = 20 * 60000;
  it('warns in the last two minutes, insists in the last one and flags the overtime', () => {
    assert.equal(T.phase(10 * 60000, total), 'normal');
    assert.equal(T.phase(120001, total), 'normal');
    assert.equal(T.phase(120000, total), 'warning');
    assert.equal(T.phase(60000, total), 'final');
    assert.equal(T.phase(1, total), 'final');
    assert.equal(T.phase(0, total), 'over');
    assert.equal(T.phase(-5000, total), 'over');
  });

  it('scales the warnings down for short talks (a quarter and a tenth of the total)', () => {
    const four = 4 * 60000;
    assert.equal(T.phase(61000, four), 'normal');
    assert.equal(T.phase(60000, four), 'warning');
    assert.equal(T.phase(24000, four), 'final');
  });

  it('announces whole minutes only', () => {
    assert.equal(T.minuteMark(20 * 60000), 20);
    assert.equal(T.minuteMark(19 * 60000 + 1), 20);
    assert.equal(T.minuteMark(19 * 60000), 19);
    assert.equal(T.minuteMark(0), 0);
    assert.equal(T.minuteMark(-1), -1);
    assert.equal(T.minuteMark(-60000), -1);
    assert.equal(T.minuteMark(-60001), -2);
    assert.equal(T.announcement(5), 'Quedan 5 minutos.');
    assert.equal(T.announcement(1), 'Queda 1 minuto.');
    assert.equal(T.announcement(0), 'Tiempo cumplido.');
    assert.equal(T.announcement(-1), 'Tiempo cumplido.');
    assert.equal(T.announcement(-3), 'Tiempo excedido: 2 minutos de más.');
    assert.equal(T.announcement(-2), 'Tiempo excedido: 1 minuto de más.');
  });
});

describe('timer: state machine with an injected clock', () => {
  it('starts idle with the full time', () => {
    const clock = fakeClock();
    const t = T.create({ minutes: 20, now: clock.now });
    const s = t.snapshot();
    assert.equal(s.status, 'idle');
    assert.equal(s.text, '20:00');
    assert.equal(s.remainingMs, 1200000);
    assert.equal(s.phase, 'normal');
    clock.advance(5000);
    assert.equal(t.snapshot().text, '20:00', 'idle does not run');
  });

  it('runs, pauses (time frozen), resumes and resets', () => {
    const clock = fakeClock();
    const t = T.create({ minutes: 20, now: clock.now });
    t.start();
    clock.advance(1500);
    assert.equal(t.snapshot().status, 'running');
    assert.equal(t.snapshot().text, '19:59');
    t.pause();
    clock.advance(5000);
    assert.equal(t.snapshot().status, 'paused');
    assert.equal(t.snapshot().elapsedMs, 1500);
    t.start();
    clock.advance(500);
    assert.equal(t.snapshot().elapsedMs, 2000);
    assert.equal(t.tick().text, '19:58');
    t.reset();
    assert.equal(t.snapshot().status, 'idle');
    assert.equal(t.snapshot().text, '20:00');
  });

  it('toggles between running and paused, and ignores repeated start or pause', () => {
    const clock = fakeClock();
    const t = T.create({ minutes: 1, now: clock.now });
    assert.equal(t.toggle().status, 'running');
    clock.advance(1000);
    t.start();
    clock.advance(1000);
    assert.equal(t.snapshot().elapsedMs, 2000);
    assert.equal(t.toggle().status, 'paused');
    t.pause();
    assert.equal(t.snapshot().elapsedMs, 2000);
    t.reset();
    t.pause();
    assert.equal(t.snapshot().status, 'idle');
  });

  it('keeps the elapsed time when the total changes, and rejects invalid totals', () => {
    const clock = fakeClock();
    const t = T.create({ minutes: 20, now: clock.now });
    t.start();
    clock.advance(60000);
    assert.equal(t.setMinutes(10), true);
    assert.equal(t.snapshot().text, '09:00');
    assert.equal(t.setMinutes('nope'), false);
    assert.equal(t.snapshot().totalMs, 600000);
  });

  it('keeps running past zero, in overtime', () => {
    const clock = fakeClock();
    const t = T.create({ minutes: 1, now: clock.now });
    t.start();
    clock.advance(61000);
    const s = t.snapshot();
    assert.equal(s.phase, 'over');
    assert.equal(s.text, '−00:01');
    assert.equal(s.minuteMark, -1);
  });

  it('falls back to the default length when created without a valid one', () => {
    assert.equal(T.create({ minutes: 'x', now: () => 0 }).snapshot().totalMs, T.DEFAULT_MINUTES * 60000);
  });
});
