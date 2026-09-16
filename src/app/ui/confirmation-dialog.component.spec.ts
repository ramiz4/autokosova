import { TestBed } from '@angular/core/testing';
import { ConfirmationDialogComponent } from './confirmation-dialog.component';

async function render() {
  await TestBed.configureTestingModule({
    imports: [ConfirmationDialogComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(ConfirmationDialogComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    fixture,
    component: fixture.componentInstance,
    page: fixture.nativeElement as HTMLElement,
  };
}

const request = {
  title: 'Risky action',
  description: 'Confirm this synthetic action.',
  confirmLabel: 'Continue',
  cancelLabel: 'Cancel',
};

it('fails a duplicate request closed and resolves the approved request once', async () => {
  const { component, fixture } = await render();
  const accepted = component.ask(request);
  fixture.detectChanges();
  await fixture.whenStable();
  await expect(component.ask(request)).resolves.toBe(false);
  document.querySelector<HTMLButtonElement>('[data-confirmation-confirm]')!.click();
  await expect(accepted).resolves.toBe(true);
  expect(component.state()).toBe('closed');
});

it('initially focuses cancel and maps Escape and cancellation to false', async () => {
  const { component, fixture } = await render();
  const escaped = component.ask(request);
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.activeElement).toBe(document.querySelector('[data-confirmation-cancel]'));
  document
    .querySelector<HTMLElement>('section')!
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  await expect(escaped).resolves.toBe(false);
  const cancelled = component.ask(request);
  component.cancelPending();
  await expect(cancelled).resolves.toBe(false);
});

it('fails closed when destroyed before its overlay opens', async () => {
  const { component, fixture } = await render();
  const pending = component.ask(request);
  fixture.destroy();
  await expect(pending).resolves.toBe(false);
});

it('does not let a stale close settle a newer decision', async () => {
  const { component } = await render();
  const first = component.ask(request);
  component.cancelPending();
  await expect(first).resolves.toBe(false);
  await expect(component.ask(request)).resolves.toBe(false);
  (component as unknown as { closed(answer: unknown): void }).closed(undefined);
  const second = component.ask(request);
  (component as unknown as { closed(answer: unknown): void }).closed(true);
  await expect(second).resolves.toBe(true);
});
