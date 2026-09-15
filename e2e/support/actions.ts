import { expect, type Page } from '@playwright/test';
import { inquiriesCopy } from '../../src/shared/inquiries-copy';
import { card } from './journeys';

function contrast(foreground: string, background: string): number {
  const luminance = (rgb: string) => {
    const channels = rgb
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const value = n / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Migration of #114's real pointer/keyboard/contrast checks, without synthetic clicks. */
export async function checkActions(
  page: Page,
  activeId: string,
  inactiveId: string,
  locale: 'de' | 'sq' | 'en',
) {
  const text = inquiriesCopy[locale];
  const trigger = (id: string) => card(page, id).locator('[data-inquiry-menu]');
  await page.mouse.move(0, 0);
  await page.locator('#inquiries-title').focus();
  const buttons = await page.locator('[data-inquiry-menu]').evaluateAll((elements) =>
    elements.map((el) => {
      const style = getComputedStyle(el),
        box = el.getBoundingClientRect();
      return {
        foreground: style.color,
        background: style.backgroundColor,
        border: parseFloat(style.borderWidth),
        width: box.width,
        height: box.height,
        hover: el.matches(':hover'),
        focused: el.matches(':focus'),
        stroke: Number(el.querySelector('svg')?.getAttribute('stroke-width')),
      };
    }),
  );
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.border).toBeGreaterThanOrEqual(1);
    expect(button.background).not.toContain('rgba');
    expect(button.hover || button.focused).toBe(false);
    expect(button.stroke).toBeGreaterThanOrEqual(4);
    expect(contrast(button.foreground, button.background)).toBeGreaterThanOrEqual(3);
  }
  for (const id of [activeId, inactiveId]) {
    const footer = card(page, id).locator('.card-footer');
    await expect(footer.locator('a,button')).toHaveCount(2);
    await expect(
      footer.locator('[data-edit-inquiry],[data-toggle-inquiry],[data-delete-inquiry]'),
    ).toHaveCount(0);
    expect(
      await footer.evaluate(
        (el) =>
          el.querySelector('[data-inquiry-view]')!.getBoundingClientRect().right <=
          el.querySelector('.search-action > :is(a,button)')!.getBoundingClientRect().left,
      ),
    ).toBe(true);
  }
  const disabledSearch = card(page, inactiveId).locator('[data-inquiry-search-disabled]');
  await expect(disabledSearch).toBeDisabled();
  await expect(disabledSearch).toHaveAttribute('aria-describedby', 'search-help-' + inactiveId);
  await expect(card(page, inactiveId).locator('[data-inquiry-search-help]')).toHaveText(
    text.activateToSearch,
  );
  await expect(card(page, inactiveId).locator('[data-inquiry-search]')).toHaveCount(0);
  for (const [id, active] of [
    [activeId, true],
    [inactiveId, false],
  ] as const) {
    await trigger(id).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      text.edit,
      active ? text.deactivate : text.reactivate,
      text.deleteConfirm,
    ]);
    await expect(menu.locator('[data-edit-inquiry]')).toBeFocused();
    expect(
      await menu.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return (
          box.left >= 0 &&
          box.right <= innerWidth &&
          [...el.querySelectorAll('button')].every(
            (button) => button.scrollWidth <= button.clientWidth + 1,
          ) &&
          !!el
            .querySelector('[role="separator"]')
            ?.nextElementSibling?.matches('[data-delete-inquiry]')
        );
      }),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger(id)).toBeFocused();
  }
  await trigger(activeId).focus();
  await page.keyboard.press('Enter');
  await expect(card(page, activeId).locator('[data-edit-inquiry]')).toBeFocused();
  for (const [key, selector] of [
    ['ArrowDown', '[data-toggle-inquiry]'],
    ['End', '[data-delete-inquiry]'],
    ['ArrowDown', '[data-edit-inquiry]'],
    ['ArrowUp', '[data-delete-inquiry]'],
    ['Home', '[data-edit-inquiry]'],
  ]) {
    await page.keyboard.press(key);
    await expect(page.getByRole('menu').locator(selector)).toBeFocused();
  }
  await page.keyboard.press('Escape');
  await expect(trigger(activeId)).toBeFocused();
  expect(
    await trigger(activeId).evaluate(
      (el) => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) >= 2,
    ),
  ).toBe(true);
  await page.keyboard.press('Space');
  await expect(card(page, activeId).locator('[data-edit-inquiry]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(card(page, activeId).locator('[data-inquiry-view]')).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const previous = await trigger(activeId).evaluateHandle((el) => {
    const stops = [...document.querySelectorAll<HTMLElement>('a[href],button,[tabindex]')].filter(
      (item) =>
        item.tabIndex >= 0 && !(item as HTMLButtonElement).disabled && item.checkVisibility(),
    );
    return stops[stops.indexOf(el as HTMLElement) - 1];
  });
  await trigger(activeId).focus();
  await page.keyboard.press('Enter');
  await expect(card(page, activeId).locator('[data-edit-inquiry]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => previous.evaluate((el) => el === document.activeElement)).toBe(true);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await previous.dispose();
  await trigger(activeId).click();
  await trigger(inactiveId).click();
  await expect(page.getByRole('menu')).toHaveCount(1);
  await expect(card(page, inactiveId).locator('[data-edit-inquiry]')).toBeFocused();
  await page.locator('#inquiries-title').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}
