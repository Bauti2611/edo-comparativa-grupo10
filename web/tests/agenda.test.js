'use strict';
/**
 * Agenda budget of the talk (js/ui/agenda.js): minutes parsing and the time per section computed from config.talk.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const T = require('../js/ui/agenda.js');
const config = require('../js/config.js');

const sum = (items) => items.reduce((acc, item) => acc + item.seconds, 0);

describe('agenda: parsing and durations', () => {
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

describe('agenda: budget from config.talk', () => {
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
});
