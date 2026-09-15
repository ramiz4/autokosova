import assert from 'node:assert/strict';
import { until } from './inquiries-test-browser.mjs';

const labels = {
  de: ['Bearbeiten', 'Deaktivieren', 'Aktivieren', 'Anfrage löschen'],
  sq: ['Ndrysho', 'Çaktivizo', 'Aktivizo', 'Fshi kërkesën'],
  en: ['Edit', 'Deactivate', 'Activate', 'Delete inquiry'],
};
function contrast(foreground, background) {
  const luminance = (rgb) => {
    const channels = rgb
      .match(/[\d.]+/g)
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

/** Real Chrome input and computed layout, using only the DB smoke's fictional inquiries. */
export async function checkInquiryActions(
  browser,
  { locale, width, activeId, inactiveId, output },
) {
  const { command, evaluate } = browser;
  const trigger = (id) => `[data-inquiry-id="${id}"] [data-inquiry-menu]`;
  async function press(key, code, virtualKey, modifiers = 0) {
    const params = { key, code, windowsVirtualKeyCode: virtualKey, modifiers };
    await command('Input.dispatchKeyEvent', {
      type: 'keyDown',
      ...params,
      ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
    });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }
  async function focused(selector) {
    await until(
      () => evaluate(`document.activeElement?.matches(${JSON.stringify(selector)})`),
      'menu focus: ' + selector,
    );
  }
  async function pointerClick(selector) {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    const point = await until(
      () =>
        evaluate(`(async () => {
      const el=document.querySelector(${JSON.stringify(selector)});
      const before=el.getBoundingClientRect();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const r=el.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
      return before.x===r.x && before.y===r.y && el.contains(document.elementFromPoint(x,y)) &&
        {x,y};
    })()`),
      'stable and unobstructed pointer target',
    );
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...point,
    });
    await command('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...point,
    });
  }
  // Measure the default state, not a misleading hover/focus appearance.
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await evaluate(`document.activeElement?.blur(); window.scrollTo({top:0,behavior:'instant'})`);
  const buttons =
    await evaluate(`Array.from(document.querySelectorAll('[data-inquiry-menu]'), b => {
    const s=getComputedStyle(b), r=b.getBoundingClientRect();
    return {foreground:s.color, background:s.backgroundColor, border:parseFloat(s.borderWidth),
      width:r.width,height:r.height,hover:b.matches(':hover'),focused:b.matches(':focus'),
      stroke:Number(b.querySelector('svg').getAttribute('stroke-width'))};
  })`);
  for (const button of buttons) {
    assert.ok(button.width >= 44 && button.height >= 44);
    assert.ok(button.border >= 1 && !button.background.includes('rgba'));
    assert.ok(!button.hover && !button.focused);
    assert.ok(button.stroke >= 4);
    assert.ok(contrast(button.foreground, button.background) >= 3);
  }
  assert.equal(
    await evaluate(`Array.from(document.querySelectorAll('.card-footer')).every(footer => {
    const details=footer.querySelector('[data-inquiry-view]'), search=footer.querySelector('.search-action > :is(a,button)');
    return footer.querySelectorAll('a,button').length===2 &&
      !footer.querySelector('[data-edit-inquiry],[data-toggle-inquiry],[data-delete-inquiry]') &&
      details.getBoundingClientRect().right <= search.getBoundingClientRect().left;
  })`),
    true,
    'two separated footer actions, details left and search right',
  );
  assert.equal(
    await evaluate(`(() => {
    const card=document.querySelector('[data-inquiry-id="${inactiveId}"]');
    const button=card.querySelector('[data-inquiry-search-disabled]'), help=card.querySelector('[data-inquiry-search-help]');
    return button.disabled && !card.querySelector('[data-inquiry-search]') && !!help.textContent.trim() &&
      button.getAttribute('aria-describedby')===help.id;
  })()`),
    true,
    'inactive search is disabled and explained',
  );
  await browser.screenshot(`${output}/${locale}-${width}.png`, width);

  for (const [id, active] of [
    [activeId, true],
    [inactiveId, false],
  ]) {
    await pointerClick(trigger(id));
    await focused('[data-edit-inquiry]');
    const popup = await evaluate(`(() => {
      const menu=document.querySelector('[role="menu"]'), r=menu.getBoundingClientRect();
      return {items:Array.from(menu.querySelectorAll('[role="menuitem"]'), b=>b.textContent.trim()),
        inside:r.left>=0 && r.right<=innerWidth,
        clipped:Array.from(menu.querySelectorAll('button')).some(b=>b.scrollWidth>b.clientWidth+1),
        separated:menu.querySelector('[role="separator"]').nextElementSibling.matches('[data-delete-inquiry]')};
    })()`);
    assert.deepEqual(popup, {
      items: [labels[locale][0], labels[locale][active ? 1 : 2], labels[locale][3]],
      inside: true,
      clipped: false,
      separated: true,
    });
    await evaluate("window.scrollTo({top:0,behavior:'instant'})");
    await browser.screenshot(
      `${output}/${locale}-${width}-menu-${active ? 'active' : 'inactive'}.png`,
      width,
    );
    await browser.key('Escape', 27);
    await focused(trigger(id));
    await until(() => evaluate(`!document.querySelector('[role="menu"]')`), 'Escape closes menu');
  }
  await evaluate(`document.querySelector(${JSON.stringify(trigger(activeId))}).focus()`);
  await press('Enter', 'Enter', 13);
  await focused('[data-edit-inquiry]');
  for (const [key, code, selector] of [
    ['ArrowDown', 40, '[data-toggle-inquiry]'],
    ['End', 35, '[data-delete-inquiry]'],
    ['ArrowDown', 40, '[data-edit-inquiry]'],
    ['ArrowUp', 38, '[data-delete-inquiry]'],
    ['Home', 36, '[data-edit-inquiry]'],
  ]) {
    await browser.key(key, code);
    await focused(selector);
  }
  await browser.key('Escape', 27);
  await focused(trigger(activeId));
  assert.ok(
    await evaluate(
      `document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2`,
    ),
  );
  await press(' ', 'Space', 32);
  await focused('[data-edit-inquiry]');
  await press('Tab', 'Tab', 9);
  await focused(`[data-inquiry-id="${activeId}"] [data-inquiry-view]`);
  await until(() => evaluate(`!document.querySelector('[role="menu"]')`), 'Tab closes menu');
  await evaluate(`(() => {
    const trigger=document.querySelector(${JSON.stringify(trigger(activeId))});
    const stops=Array.from(document.querySelectorAll('a[href],button,[tabindex]')).filter(el=>el.tabIndex>=0 && !el.disabled && el.getClientRects().length);
    window.previousMenuTabTarget=stops[stops.indexOf(trigger)-1]; trigger.focus();
  })()`);
  await press('Enter', 'Enter', 13);
  await focused('[data-edit-inquiry]');
  await press('Tab', 'Tab', 9, 8);
  await until(
    () =>
      evaluate(
        `document.activeElement===window.previousMenuTabTarget && !document.querySelector('[role="menu"]')`,
      ),
    'Shift+Tab leaves the menu',
  );
  await pointerClick(trigger(activeId));
  await focused('[data-edit-inquiry]');
  await pointerClick(trigger(inactiveId));
  await focused('[data-edit-inquiry]');
  assert.equal(await evaluate(`document.querySelectorAll('[role="menu"]').length`), 1);
  await pointerClick('h1');
  await until(
    () => evaluate(`!document.querySelector('[role="menu"]')`),
    'outside pointer closes menu',
  );
  await evaluate("window.scrollTo({top:0,behavior:'instant'})");
  console.log(`Action menu layout/contrast/pointer/keyboard passed: ${locale}, ${width}px`);
}
