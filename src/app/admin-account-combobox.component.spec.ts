import { TestBed } from '@angular/core/testing';
import { AdminAccountComboboxComponent } from './admin-account-combobox.component';

it('supports keyboard selection without exposing account fields beyond label and id', async () => {
  await TestBed.configureTestingModule({
    imports: [AdminAccountComboboxComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminAccountComboboxComponent);
  const component = fixture.componentInstance;
  component.id = 'account';
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
