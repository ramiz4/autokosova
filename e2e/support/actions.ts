import { expect, type Page } from '@playwright/test';
import { inquiriesCopy } from '../../src/shared/inquiries-copy';
import { card } from './journeys';

/** Assert the shared customer action contract without coupling it to card styling. */
export async function checkActions(
  page: Page,
  activeId: string,
  inactiveId: string,
  locale: 'de' | 'sq' | 'en',
) {
  const text = inquiriesCopy[locale];
  const trigger = (id: string) => card(page, id).locator('[data-inquiry-menu]');
  for (const [id, active] of [
    [activeId, true],
    [inactiveId, false],
  ] as const) {
    await expect(trigger(id)).toBeVisible();
    await trigger(id).click();
    const menu = page.getByRole('menu');
    await expect(menu.locator('[data-inquiry-view]')).toContainText(text.view);
    await expect(menu.locator('[data-edit-inquiry]')).toContainText(text.edit);
    await expect(menu.locator('[data-toggle-inquiry]')).toContainText(
      active ? text.deactivate : text.reactivate,
    );
    await expect(menu.locator('[data-delete-inquiry]')).toContainText(text.deleteConfirm);
    if (active) await expect(menu.locator('[data-inquiry-search]')).toContainText(text.find);
    else await expect(menu.locator('[data-inquiry-search-disabled]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger(id)).toBeFocused();
  }
  await trigger(activeId).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu').locator('[data-inquiry-view]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger(activeId)).toBeFocused();
}
