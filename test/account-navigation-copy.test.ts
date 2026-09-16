import assert from 'node:assert/strict';
import test from 'node:test';
import { accountNavigationCopy } from '../src/shared/account-navigation-copy';
import { reviewLabel } from '../src/shared/review-copy';
import { staffCopy } from '../src/shared/staff-copy';

for (const language of ['de', 'sq', 'en'] as const) {
  test(`shell and lazy feature navigation labels agree in ${language}`, () => {
    const navigation = accountNavigationCopy(language);
    assert.equal(navigation.admin, staffCopy(language).admin);
    assert.equal(navigation.moderation, staffCopy(language).moderation);
    assert.equal(navigation.reviews, reviewLabel('own', language));
  });
}
