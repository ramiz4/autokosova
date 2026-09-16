import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MultiSelectComponent } from './multi-select.component';

async function setup() {
  await TestBed.configureTestingModule({
    imports: [MultiSelectComponent],
    providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: 'browser' }],
  }).compileComponents();
  const fixture = TestBed.createComponent(MultiSelectComponent);
  fixture.componentRef.setInput('controlId', 'test-selection');
  fixture.componentRef.setInput('label', 'Marken');
  fixture.componentRef.setInput('options', [
    { id: 'skoda', label: 'Škoda', aliases: ['SKODA'] },
    { id: 'vw', label: 'Volkswagen' },
    { id: 'audi', label: 'Audi' },
  ]);
  fixture.detectChanges();
  return fixture;
}

function panel(): HTMLElement {
  return document.querySelector<HTMLElement>('#test-selection-panel')!;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open(fixture: Awaited<ReturnType<typeof setup>>): Promise<HTMLElement> {
  const page = fixture.nativeElement as HTMLElement;
  page.querySelector<HTMLButtonElement>('#test-selection')!.click();
  fixture.detectChanges();
  await fixture.whenRenderingDone();
  return panel();
}

it('keeps multiple selections through alias searches and Escape, and removes without submitting', async () => {
  const fixture = await setup(),
    page = fixture.nativeElement as HTMLElement,
    component = fixture.componentInstance;
  const choices = await open(fixture);
  choices.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
  fixture.detectChanges();
  const search = choices.querySelector<HTMLInputElement>('input[type=search]')!;
  search.value = 'VOLKS';
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  choices.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
  fixture.detectChanges();
  expect(component.values()).toEqual(['skoda', 'vw']);
  search.value = 'SKODA';
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  expect(choices.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
  search.value = 'nothing';
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  expect(choices.textContent).toContain('Keine passenden Optionen');
  search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
  await fixture.whenStable();
  expect(component['opened']()).toBe(false);
  expect(document.querySelector('#test-selection-panel')).toBeNull();
  const remove = page.querySelector<HTMLButtonElement>('[aria-label="Entfernen: Škoda"]')!;
  expect(remove.type).toBe('button');
  remove.click();
  fixture.detectChanges();
  expect(component.values()).toEqual(['vw']);
  fixture.destroy();
});

it('keeps unknown selected IDs and disables every selection control while closing the portal', async () => {
  const fixture = await setup(),
    page = fixture.nativeElement as HTMLElement,
    component = fixture.componentInstance;
  fixture.componentRef.setInput('values', ['legacy-label']);
  fixture.detectChanges();
  const choices = await open(fixture);
  fixture.componentRef.setInput('loading', true);
  fixture.detectChanges();
  expect(choices.textContent).toContain('Wird geladen');
  fixture.componentRef.setInput('loading', false);
  fixture.componentRef.setInput('error', true);
  fixture.detectChanges();
  expect(choices.textContent).toContain('Auswahl konnte nicht geladen');
  expect(component.values()).toEqual(['legacy-label']);
  fixture.componentRef.setInput('disabled', true);
  fixture.detectChanges();
  await fixture.whenStable();
  expect(component['opened']()).toBe(false);
  expect(document.querySelector('#test-selection-panel')).toBeNull();
  expect(page.querySelector<HTMLButtonElement>('#test-selection')!.disabled).toBe(true);
  expect(
    page.querySelector<HTMLButtonElement>('[aria-label="Entfernen: legacy-label"]')!.disabled,
  ).toBe(true);
  component['remove']('legacy-label');
  expect(component.values()).toEqual(['legacy-label']);
  fixture.destroy();
});

it('uses the field as the full-width overlay anchor and prevents Enter from submitting', async () => {
  const fixture = await setup(),
    page = fixture.nativeElement as HTMLElement,
    component = fixture.componentInstance;
  const choices = await open(fixture);
  expect(component['positions']).toEqual([
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  ]);
  expect(choices.parentElement?.className).toContain('cdk-overlay-pane');
  const search = choices.querySelector<HTMLInputElement>('input[type=search]')!;
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  search.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(page.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  expect(choices.querySelectorAll('input[type=checkbox]')).toHaveLength(3);
  fixture.destroy();
});
