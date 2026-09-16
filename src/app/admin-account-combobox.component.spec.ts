import { TestBed } from '@angular/core/testing';
import { AdminAccountComboboxComponent } from './admin-account-combobox.component';

it('supports keyboard selection without exposing account fields beyond label and id', async () => {
  await TestBed.configureTestingModule({
    imports: [AdminAccountComboboxComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminAccountComboboxComponent);
  const component = fixture.componentInstance;
  component.inputId = 'account';
  component.label = 'Existing account';
  component.items = [
    {
      id: 'allowed-id',
      label: 'DEMO Same Name',
      status: 'active',
      accountType: 'customer',
      roles: [],
      memberships: [],
    },
  ];
  const selected = vi.fn();
  component.selected.subscribe(selected);
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.dispatchEvent(new FocusEvent('focus'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('allowed-id');
  expect(fixture.nativeElement.textContent).not.toContain('@');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(selected).toHaveBeenCalledWith(component.items[0]);
});

it('closes suggestions before keyboard focus leaves and resets active ids when results change', async () => {
  await TestBed.configureTestingModule({
    imports: [AdminAccountComboboxComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminAccountComboboxComponent);
  const component = fixture.componentInstance;
  component.inputId = 'safe-picker';
  component.label = 'Account';
  component.items = [
    {
      id: 'a',
      label: 'Same Name',
      status: 'active',
      accountType: 'customer',
      roles: [],
      memberships: [],
    },
  ];
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.dispatchEvent(new FocusEvent('focus'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  fixture.detectChanges();
  expect(input.getAttribute('aria-activedescendant')).toBe('safe-picker-option-0');
  expect(
    fixture.nativeElement
      .querySelector('[aria-selected="true"]')
      .classList.contains('bg-slate-100'),
  ).toBe(true);
  fixture.componentRef.setInput('items', []);
  fixture.detectChanges();
  expect(input.getAttribute('aria-activedescendant')).toBeNull();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  fixture.detectChanges();
  expect(input.getAttribute('aria-expanded')).toBe('false');
  expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
});

it('announces empty results and never selects an inactive or missing account', async () => {
  await TestBed.configureTestingModule({
    imports: [AdminAccountComboboxComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminAccountComboboxComponent);
  const component = fixture.componentInstance;
  component.inputId = 'account';
  component.label = 'Account';
  component.emptyLabel = 'Keine passenden Konten';
  const selected = vi.fn();
  component.selected.subscribe(selected);
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.dispatchEvent(new FocusEvent('focus'));
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
    'Keine passenden Konten',
  );
  component.choose(undefined);
  component.choose({
    id: 'suspended',
    label: 'Inactive',
    status: 'suspended',
    accountType: 'customer',
    roles: [],
    memberships: [],
  });
  expect(selected).not.toHaveBeenCalled();
  fixture.componentRef.setInput('disabled', true);
  fixture.detectChanges();
  expect(input.disabled).toBe(true);
});
