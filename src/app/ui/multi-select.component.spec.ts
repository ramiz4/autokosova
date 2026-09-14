import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MultiSelectComponent } from './multi-select.component';

async function setup() {
  await TestBed.configureTestingModule({
    imports: [MultiSelectComponent],
    providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: 'server' }],
  }).compileComponents();
  const fixture = TestBed.createComponent(MultiSelectComponent);
  fixture.componentRef.setInput('controlId', 'test-selection');
  fixture.componentRef.setInput('label', 'Marken');
  fixture.componentRef.setInput('options', [
    { id: 'skoda', label: 'Škoda' },
    { id: 'vw', label: 'Volkswagen' },
    { id: 'audi', label: 'Audi' },
  ]);
  fixture.detectChanges();
  return fixture;
}

it('keeps multiple selections through filtered searches and Escape, and removes without submitting', async () => {
  const fixture = await setup(),
    page = fixture.nativeElement as HTMLElement,
    component = fixture.componentInstance;
  page.querySelector<HTMLButtonElement>('#test-selection')!.click();
  fixture.detectChanges();
  const select = page.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  select.click();
  fixture.detectChanges();
  const search = page.querySelector<HTMLInputElement>('input[type=search]')!;
  search.value = 'VOLKS';
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  page.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
  fixture.detectChanges();
  expect(component.values()).toEqual(['skoda', 'vw']);
  search.value = 'SKODA';
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  expect(page.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
  search.value = 'nothing';
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  expect(page.textContent).toContain('Keine passenden Optionen');
  page.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
  expect(component['opened']()).toBe(false);
  const remove = page.querySelector<HTMLButtonElement>('button[aria-label="Entfernen: Škoda"]')!;
  expect(remove.type).toBe('button');
  remove.click();
  fixture.detectChanges();
  expect(component.values()).toEqual(['vw']);
});

it('shows loading, unavailable catalog and disabled states without dropping stored legacy selections', async () => {
  const fixture = await setup(),
    component = fixture.componentInstance,
    page = fixture.nativeElement as HTMLElement;
  fixture.componentRef.setInput('values', ['legacy-label']);
  component['toggle']();
  fixture.componentRef.setInput('loading', true);
  fixture.detectChanges();
  expect(page.textContent).toContain('Wird geladen');
  fixture.componentRef.setInput('loading', false);
  fixture.componentRef.setInput('error', true);
  fixture.detectChanges();
  expect(page.textContent).toContain('Auswahl konnte nicht geladen');
  expect(component.values()).toEqual(['legacy-label']);
  fixture.componentRef.setInput('disabled', true);
  fixture.detectChanges();
  component['remove']('legacy-label');
  expect(component.values()).toEqual(['legacy-label']);
});
