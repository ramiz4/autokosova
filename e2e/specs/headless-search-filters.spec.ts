import { expect, test } from '../support/application';

test('search-filter-disclosure keeps Brain state, focus and filter URLs responsive', async ({
  app,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1279, height: 900 });
  await page.goto(
    app.origin + '/garages?places=xk-pristina%3A20&service=bremsen&vehicleMake=skoda&sort=rating',
  );

  const trigger = page.locator('app-search-handoff button[brnCollapsibleTrigger]');
  const form = page.locator('app-search-handoff form[brnCollapsibleContent]');
  const vehicleMake = form.locator('select[name="vehicleMake"]');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(form).toHaveAttribute('hidden', '');
  await expect(form).toHaveJSProperty('inert', true);
  expect(await form.ariaSnapshot()).not.toContain('combobox');

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(form).toBeVisible();
  await expect(form).toHaveJSProperty('inert', false);
  await expect(vehicleMake).toHaveValue('skoda');
  await page.keyboard.press('Space');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(form).toHaveAttribute('hidden', '');
  await expect(form).toHaveJSProperty('inert', true);
  await page.keyboard.press('Tab');
  await expect(vehicleMake).not.toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(form).toBeVisible();
  await expect(form).toHaveJSProperty('inert', false);
  await vehicleMake.focus();
  await expect(vehicleMake).toBeFocused();
  await page.setViewportSize({ width: 1279, height: 900 });
  await expect(trigger).toBeFocused();
  await expect(form).toHaveAttribute('hidden', '');
  await expect(form).toHaveJSProperty('inert', true);

  await page.keyboard.press('Enter');
  await expect(form).toBeVisible();
  await expect(form).toHaveJSProperty('inert', false);
  await vehicleMake.selectOption('audi');
  await form.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(
    /places=xk-pristina%3A20.*service=bremsen.*vehicleMake=audi.*sort=rating|places=xk-pristina%3A20.*service=bremsen.*sort=rating.*vehicleMake=audi/,
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(form).toBeVisible();
  await expect(form).toHaveJSProperty('inert', false);
  await vehicleMake.focus();
  await expect(vehicleMake).toBeFocused();
  await page.setViewportSize({ width: 1279, height: 900 });
  await expect(form).toBeVisible();
  await expect(form).toHaveJSProperty('inert', false);
  await expect(vehicleMake).toBeFocused();
  await form.locator('button[type="button"]').last().click();
  await expect(page).toHaveURL(/\?all=true$/);
  await expect(vehicleMake).toHaveValue('');
  expect(errors).toEqual([]);
});
