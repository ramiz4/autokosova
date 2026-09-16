import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrnAlertDialog } from '@spartan-ng/brain/alert-dialog';
import { inquiriesCopy } from '../shared/inquiries-copy';
import type { RepairRequestSummary } from '../shared/saved-repair-request';
import { LanguageService } from './language.service';
import { InquiryDeleteDialogComponent } from './inquiry-delete-dialog.component';
import { SavedRepairRequestsService } from './saved-repair-requests.service';

const request: RepairRequestSummary = {
  id: 'delete-fixture',
  active: true,
  revision: 1,
  serviceCategoryId: 'bremsen',
  symptomPreview: 'Synthetic symptom',
  createdAt: '2026-09-16T10:00:00Z',
  updatedAt: '2026-09-16T10:00:00Z',
  areas: [],
  vehicle: { makeId: 'skoda', model: 'Fixture', year: 2020 },
};

function createSaved() {
  const writeState = signal<
    'idle' | 'saving' | 'conflict' | 'error' | 'missing' | 'forbidden' | 'csrf'
  >('idle');
  return {
    writeState,
    writeErrorKey: computed(() => (writeState() === 'error' ? 'writeError' : null)),
    mutate: vi.fn(async () => false),
  };
}

async function render(saved = createSaved()) {
  await TestBed.configureTestingModule({
    imports: [InquiryDeleteDialogComponent],
    providers: [
      { provide: SavedRepairRequestsService, useValue: saved },
      {
        provide: LanguageService,
        useValue: { language: 'en', serviceLabel: () => 'Brakes' },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(InquiryDeleteDialogComponent);
  fixture.componentRef.setInput('request', request);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, saved };
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-delete-dialog]');
}

afterEach(() => TestBed.resetTestingModule());

it('uses one Brain alert dialog with a named description, Cancel focus, and no backdrop close', async () => {
  const { fixture } = await render();
  const brainDialog = fixture.debugElement
    .query(By.directive(BrnAlertDialog))
    .injector.get(BrnAlertDialog);

  expect(brainDialog.role()).toBe('alertdialog');
  expect(brainDialog.closeOnOutsidePointerEvents()).toBe(false);
  expect(brainDialog.disableClose()).toBe(true);
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  expect(dialog()?.querySelector('[brnAlertDialogTitle]')?.textContent).toContain(
    inquiriesCopy.en.deleteTitle,
  );
  expect(dialog()?.querySelector('[brnAlertDialogDescription]')).not.toBeNull();
  expect(document.activeElement).toBe(document.querySelector('[data-cancel-delete]'));
});

it('cancels on Escape only while idle and never writes', async () => {
  const { fixture, saved } = await render();
  const closed = vi.fn();
  fixture.componentInstance.closed.subscribe(closed);

  dialog()!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
  expect(saved.mutate).not.toHaveBeenCalled();

  fixture.destroy();
  TestBed.resetTestingModule();
  const saving = createSaved();
  const second = await render(saving);
  saving.writeState.set('saving');
  await second.fixture.whenStable();
  const blockedClose = vi.fn();
  second.fixture.componentInstance.closed.subscribe(blockedClose);
  dialog()!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await second.fixture.whenStable();
  expect(blockedClose).not.toHaveBeenCalled();
  expect(dialog()).not.toBeNull();
});

it('makes one pending delete, disables both actions, and closes only after server confirmation', async () => {
  const saved = createSaved();
  let resolveMutation!: (success: boolean) => void;
  const pending = new Promise<boolean>((resolve) => (resolveMutation = resolve));
  saved.mutate.mockImplementation(async () => {
    saved.writeState.set('saving');
    return pending;
  });
  const { fixture } = await render(saved);
  const closed = vi.fn();
  fixture.componentInstance.closed.subscribe(closed);
  const confirm = document.querySelector<HTMLButtonElement>('[data-confirm-delete]')!;

  confirm.click();
  confirm.click();
  await vi.waitFor(() => expect(saved.writeState()).toBe('saving'));
  await fixture.whenStable();
  expect(saved.mutate).toHaveBeenCalledOnce();
  expect(confirm.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('[data-cancel-delete]')!.disabled).toBe(true);
  expect(closed).not.toHaveBeenCalled();

  resolveMutation(true);
  await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
});

it('keeps the dialog open after a failed write and while its session is destroyed', async () => {
  const saved = createSaved();
  saved.mutate.mockImplementation(async () => {
    saved.writeState.set('error');
    return false;
  });
  const { fixture } = await render(saved);
  const closed = vi.fn();
  fixture.componentInstance.closed.subscribe(closed);

  document.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.click();
  await vi.waitFor(() => expect(saved.writeState()).toBe('error'));
  await fixture.whenStable();
  expect(dialog()).not.toBeNull();
  expect(dialog()?.querySelector('[role="alert"]')).not.toBeNull();
  expect(closed).not.toHaveBeenCalled();

  fixture.destroy();
  expect(closed).not.toHaveBeenCalled();
});
