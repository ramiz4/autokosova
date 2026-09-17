import { TestBed } from '@angular/core/testing';
import { SelectFieldComponent } from './select-field.component';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  } else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  TestBed.resetTestingModule();
});

it('uses a BrnSelect trigger and emits the selected option', async () => {
  await TestBed.configureTestingModule({ imports: [SelectFieldComponent] }).compileComponents();
  const fixture = TestBed.createComponent(SelectFieldComponent);
  fixture.componentRef.setInput('label', 'Status filtern');
  fixture.componentRef.setInput('value', 'all');
  fixture.componentRef.setInput('options', [
    { value: 'all', label: 'Alle Status' },
    { value: 'published', label: 'Veröffentlicht' },
  ]);
  const selected = vi.fn();
  fixture.componentInstance.valueChange.subscribe(selected);
  fixture.detectChanges();

  const trigger = fixture.nativeElement.querySelector('[brnselecttrigger]') as HTMLButtonElement;
  expect(trigger.getAttribute('role')).toBe('combobox');
  trigger.click();
  await fixture.whenStable();

  const items = Array.from(document.querySelectorAll<HTMLElement>('[brnselectitem]'));
  expect(items.map((item) => item.textContent?.trim())).toEqual(['Alle Status', 'Veröffentlicht']);
  items[1].click();
  await fixture.whenStable();

  expect(selected).toHaveBeenCalledWith('published');
});
