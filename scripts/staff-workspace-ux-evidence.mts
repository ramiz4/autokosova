/** Read-only synthetic screenshots at the documented audit baseline and current implementation. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { App } from '../e2e/support/application';

const [source = '.', destination = 'test-results/staff-workspace-ux/after', phase = 'after'] =
  process.argv.slice(2);
assert.ok(phase === 'before' || phase === 'after');
assert.notEqual(process.env['NODE_ENV'], 'production');
const root = resolve(source),
  output = resolve(destination);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await mkdir(output, { recursive: true });
process.chdir(root);
const { chromium, expect } = (await import(
  pathToFileURL(join(root, 'node_modules/@playwright/test/index.mjs')).href
)) as typeof import('@playwright/test');
const { createApplication } = (await import(
  pathToFileURL(join(root, 'e2e/support/application.ts')).href
)) as { createApplication: () => Promise<App> };
let app: App | undefined;
const browser = await chromium.launch();
const measurements: Record<string, unknown>[] = [];
try {
  app = await createApplication();
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    // Only navigation away from a synthetic preview may discard; this script never decides a case.
    page.on('dialog', async (dialog) => {
      assert.equal(
        dialog.type(),
        'beforeunload',
        'No mutation confirmations during evidence capture',
      );
      await dialog.accept();
    });
    const snapshot = async (name: string, taskSelector?: string) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const metrics = await page.evaluate((selector) => {
        const task = selector ? document.querySelector(selector) : null;
        const button = task?.querySelector('[data-open-case]');
        return {
          width: innerWidth,
          height: innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          firstTaskTop: task?.getBoundingClientRect().top ?? null,
          taskActionBottom: button?.getBoundingClientRect().bottom ?? null,
          taskActionHeight: button?.getBoundingClientRect().height ?? null,
        };
      }, taskSelector);
      if (phase === 'after') {
        assert.equal(metrics.horizontalOverflow, false, name + ' must reflow');
        if (taskSelector) {
          assert.ok(
            metrics.firstTaskTop !== null && metrics.firstTaskTop < viewport.height,
            name + ' first task visible',
          );
          assert.ok(
            metrics.taskActionBottom !== null && metrics.taskActionBottom <= viewport.height,
            name + ' first task action reachable',
          );
          assert.ok(
            metrics.taskActionHeight !== null && metrics.taskActionHeight >= 44,
            name + ' primary touch target',
          );
        }
      }
      const file = `${name}-${metrics.width}.png`;
      await page.screenshot({ path: join(output, file), fullPage: true });
      measurements.push({ name, file, ...metrics });
      console.log(`${phase}: ${file}`);
    };
    const openCase = async (id: string, area = 'moderation') => {
      await page.goto(app!.origin + '/' + area);
      await expect(page.locator('[data-staff-list]')).toHaveAttribute('aria-busy', 'false');
      await page.locator(`[data-case-id="${id}"] [data-open-case]`).click();
      await expect(page.locator('[data-staff-case]')).toBeVisible();
    };
    for (const locale of ['de', 'sq', 'en']) {
      for (const role of ['admin', 'moderator'] as const) {
        await app.login(page, role, locale);
        await expect(page.locator('[data-staff-list]')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('[data-case-id]').first()).toBeVisible();
        await snapshot(`${role}-tasks-${locale}`, '[data-case-id]');
      }
    }
    await app.login(page, 'moderator');
    await openCase('review:demo-staff-review-assigned');
    await page.locator('[data-evidence]').click();
    await expect(page.locator('[data-evidence-text]')).toContainText('DEMO');
    if (phase === 'before')
      await page.locator('#staff-decision-action').selectOption('publish_review');
    await snapshot('review-publish-de');
    await openCase('review:demo-staff-review-mismatch');
    if (phase === 'before')
      await page.locator('#staff-decision-action').selectOption('reject_review');
    else await page.locator('[data-reject-review]').click();
    await snapshot('review-reject-de');
    for (const [id, name] of [
      ['review:demo-staff-review-blocked', 'review-missing-evidence-de'],
      ['review:demo-staff-review-appeal', 'review-independent-appeal-de'],
      ['review:demo-staff-review-own-appeal', 'review-own-appeal-de'],
    ]) {
      await openCase(id!);
      await snapshot(name!);
    }
    await app.login(page, 'admin');
    await openCase('review:demo-staff-review-unassigned', 'admin');
    await snapshot('admin-takeover-de');
    for (const [id, name] of [
      ['demo-admin-garage-pending', 'garage-review'],
      ['demo-admin-garage-members', 'garage-team'],
      ['demo-admin-garage-incomplete', 'garage-blocked'],
    ]) {
      await page.goto(app.origin + '/admin/garages');
      await expect(page.locator('[data-admin-garage-list]')).toBeVisible();
      await page.locator('[data-admin-query]').fill(id!);
      await page.locator('[data-admin-search]').click();
      await page.locator(`[data-admin-garage-id="${id}"] [data-admin-open-garage]`).click();
      await expect(page.locator('[data-admin-garage]')).toBeVisible();
      if (phase === 'after' && name === 'garage-team')
        await page.locator('[data-admin-tab="team"]').click();
      if (name === 'garage-review') {
        await page.locator('[data-company-document]').first().click();
        await expect(page.locator('[data-company-evidence]')).toContainText('DEMO');
      }
      await snapshot(`${name}-de`);
    }
    await page.goto(app.origin + '/admin/privacy' + (phase === 'after' ? '?status=blocked' : ''));
    await expect(page.locator('[data-admin-deletions]')).toBeVisible();
    await snapshot('privacy-blockers-de');
    if (phase === 'after' && viewport.width === 1280) {
      // 320 CSS pixels exercise the layout width corresponding to 400% desktop reflow.
      // This is a reflow check, not a claim about a particular browser's zoom UI.
      await page.setViewportSize({ width: 320, height: 900 });
      for (const section of ['garages', 'users', 'privacy']) {
        await page.goto(app.origin + '/admin/' + section);
        await expect(page.locator('main h1')).toBeVisible();
        await snapshot('reflow-320-' + section);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await app?.close();
  await writeFile(
    join(output, 'metrics.json'),
    JSON.stringify(
      { revision, phase, kind: 'synthetic-expert-walkthrough-not-user-study', measurements },
      null,
      2,
    ),
  );
}
