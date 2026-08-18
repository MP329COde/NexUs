import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTable } from '../src/format.js';

test('formatTable : aucune ligne renvoie un message explicite, pas un tableau vide illisible', () => {
  assert.equal(formatTable([], [{ header: 'ID', value: (r) => r.id }]), '(aucun résultat)');
});

test('formatTable : aligne les colonnes sur la valeur la plus longue (en-tête compris)', () => {
  const rows = [{ id: 'a', name: 'billing-api' }, { id: 'bb', name: 'x' }];
  const out = formatTable(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: 'NOM', value: (r) => r.name }
  ]);
  const lines = out.split('\n');
  assert.equal(lines.length, 4); // en-tête + séparateur + 2 lignes
  assert.match(lines[0].trimEnd(), /^ID\s+NOM$/);
  // la colonne NOM doit être assez large pour "billing-api" sur toutes les lignes
  assert.ok(lines.every((l) => l.length >= 'billing-api'.length));
});

test('formatTable : une valeur manquante (undefined/null) devient une chaîne vide, jamais "undefined" affiché', () => {
  const out = formatTable([{ id: 'a', name: null }], [
    { header: 'ID', value: (r) => r.id },
    { header: 'NOM', value: (r) => r.name }
  ]);
  assert.ok(!out.includes('undefined'));
  assert.ok(!out.includes('null'));
});
