import assert from 'node:assert/strict';
import test from 'node:test';
import { places, serviceCategories, vehicleMakes } from '../db/catalog.mjs';

test('catalog has the required start categories and stable unique IDs', () => {
  assert.deepEqual(
    serviceCategories.map(([id]) => id),
    [
      'service-inspektion',
      'bremsen',
      'reifen',
      'motor',
      'getriebe',
      'elektronik-diagnose',
      'klima',
      'karosserie',
    ],
  );
  assert.equal(new Set(vehicleMakes.map(([id]) => id)).size, vehicleMakes.length);
  assert.equal(new Set(places.map(([id]) => id)).size, places.length);
});

test('Prishtina aliases preserve diacritic and common spelling variants', () => {
  const pristina = places.find(([id]) => id === 'xk-pristina');
  assert.ok(pristina);
  assert.equal(pristina[2], 'Prishtina');
  const aliases = pristina[3];
  assert.ok(aliases.includes('Prishtinë'));
  assert.ok(aliases.includes('Pristina'));
});
