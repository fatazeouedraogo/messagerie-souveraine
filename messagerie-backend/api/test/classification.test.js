import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCreateRoomRequest, clearanceAllows, resolvePolicy } from '../src/classification.js';
import { canonical } from '../src/audit.js';
import { generateTempPassword } from '../src/services/passwords.js';

describe('classification', () => {
  it('habilitation : niveau agent >= niveau salon', () => {
    assert.equal(clearanceAllows(2, 'CONFIDENTIEL'), true);
    assert.equal(clearanceAllows(1, 'CONFIDENTIEL'), false);
    assert.equal(clearanceAllows(0, 'NORMAL'), true);
    assert.equal(clearanceAllows(2, 'INCONNU'), false);
  });

  it('valeurs par défaut et bornes de conservation', () => {
    assert.equal(resolvePolicy('NORMAL').ttlMs, null);
    assert.equal(resolvePolicy('CONFIDENTIEL').ttlMs, 86_400_000);
    assert.equal(resolvePolicy('NORMAL', 60).ttlMs, 3_600_000);
    assert.throws(() => resolvePolicy('NORMAL', 2), RangeError);
    assert.throws(() => resolvePolicy('NORMAL', 10 ** 9), RangeError);
    assert.throws(() => resolvePolicy('SECRET'), RangeError);
  });

  it('le salon NORMAL est aussi chiffré et privé, sans rétention', () => {
    const body = buildCreateRoomRequest({ name: 'x', policy: resolvePolicy('NORMAL'), creatorMxid: '@a:s', serviceMxid: '@svc:s', inviteMxids: ['@b:s', '@b:s', '@svc:s'] });
    const types = body.initial_state.map((s) => s.type);
    assert.ok(types.includes('m.room.encryption'));
    assert.ok(!types.includes('m.room.retention'));
    assert.deepEqual(body.invite, ['@a:s', '@b:s']);
  });
});

describe('utilitaires', () => {
  it('JSON canonique indépendant de l\'ordre des clés', () => {
    assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
  it('mots de passe temporaires uniques', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
    assert.equal(set.size, 200);
  });
});
