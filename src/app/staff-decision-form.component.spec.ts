import { TestBed } from '@angular/core/testing';
import { StaffDecisionFormComponent } from './staff-decision-form.component';
import { LanguageService } from './language.service';
import type { StaffCaseDetail } from '../shared/moderation';
import type { StaffCaseDecision } from '../shared/staff-decision';

const detail: StaffCaseDetail = {
  id: 'review:synthetic-review',
  subjectId: 'synthetic-review',
  subjectType: 'review',
  kind: 'review_submission',
  priority: 'normal',
  status: 'assigned',
  revision: 7,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
  label: 'DEMO',
  history: [],
  appeals: [],
  canAssign: false,
  canEscalate: true,
  conflictOfInterest: false,
  evidenceAvailable: true,
  allowedActions: ['publish_review', 'reject_review', 'request_information'],
};
afterEach(() => vi.restoreAllMocks());
async function render(language = 'de', value = detail) {
  await TestBed.configureTestingModule({
    imports: [StaffDecisionFormComponent],
    providers: [{ provide: LanguageService, useValue: { language } }],
  }).compileComponents();
  const fixture = TestBed.createComponent(StaffDecisionFormComponent);
  fixture.componentRef.setInput('detail', value);
  await fixture.whenStable();
  const decisions: StaffCaseDecision[] = [];
  fixture.componentInstance.submitted.subscribe((decision) => decisions.push(decision));
  return {
    fixture,
    component: fixture.componentInstance,
    page: fixture.nativeElement as HTMLElement,
    decisions,
  };
}
it.each(['de', 'sq', 'en'])(
  'uses explicit checklist, confirmation and unchanged case revision in %s',
  async (language) => {
    const { fixture, component, page, decisions } = await render(language);
    component.action = 'publish_review';
    component.garageMatches = component.serviceMatches = true;
    expect(component.valid()).toBe(false);
    component.visitMonthMatches = true;
    expect(component.valid()).toBe(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.submit();
    expect(decisions).toHaveLength(0);
    confirm.mockReturnValue(true);
    component.submit();
    expect(decisions[0]).toEqual({
      action: 'publish_review',
      revision: 7,
      checklist: { garageMatches: true, serviceMatches: true, visitMonthMatches: true },
    });
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(page.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true);
    component.submit();
    expect(decisions).toHaveLength(1);
  },
);
it('never offers publication without a readable proof or in an interested case', async () => {
  const { fixture, component, page } = await render('de', {
    ...detail,
    evidenceAvailable: false,
    allowedActions: ['reject_review'],
  });
  component.action = 'publish_review';
  component.garageMatches = component.serviceMatches = component.visitMonthMatches = true;
  expect(component.valid()).toBe(false);
  fixture.componentRef.setInput('detail', {
    ...detail,
    conflictOfInterest: true,
    allowedActions: [],
  });
  await fixture.whenStable();
  expect(page.querySelector('form')).toBeNull();
  expect(page.querySelector('[data-no-decision]')).not.toBeNull();
});
it('requires a rejection reason, preserves input while busy changes, and resets on a new revision', async () => {
  const { fixture, component } = await render();
  component.action = 'reject_review';
  expect(component.valid()).toBe(false);
  component.rejectionReason = 'evidence_not_sufficient';
  expect(component.valid()).toBe(true);
  fixture.componentRef.setInput('busy', true);
  await fixture.whenStable();
  fixture.componentRef.setInput('busy', false);
  await fixture.whenStable();
  expect(component.rejectionReason).toBe('evidence_not_sufficient');
  fixture.componentRef.setInput('detail', { ...detail, revision: 8 });
  await fixture.whenStable();
  expect(component.action).toBe('');
  expect(component.rejectionReason).toBe('');
});
it('blocks a stale decision until a conscious current read while retaining all local proof checks', async () => {
  const { fixture, component, page, decisions } = await render();
  component.action = 'publish_review';
  component.garageMatches = component.serviceMatches = component.visitMonthMatches = true;
  fixture.componentRef.setInput('stale', true);
  await fixture.whenStable();
  expect(component.valid()).toBe(false);
  expect(page.querySelector<HTMLButtonElement>('[data-publish-review]')!.disabled).toBe(true);
  expect(component.garageMatches).toBe(true);
  fixture.componentRef.setInput('stale', false);
  await fixture.whenStable();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  component.submit();
  expect(decisions).toHaveLength(1);
});
it('keeps permitted information requests visible next to review decisions, including missing proof', async () => {
  const { fixture, page } = await render('de', {
    ...detail,
    evidenceAvailable: false,
    allowedActions: ['reject_review', 'request_information'],
  });
  await fixture.whenStable();
  expect(
    page.querySelector('[data-secondary-review-actions] [data-action="request_information"]'),
  ).not.toBeNull();
  expect(page.querySelector('[data-publish-review]')).toBeNull();
  expect(page.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
});
it('reports a real draft, preserves it for an ordinary same-revision read and clears it on discard', async () => {
  const { fixture, component } = await render();
  const dirty: boolean[] = [];
  component.dirtyChange.subscribe((value) => dirty.push(value));
  component.garageMatches = true;
  component.emitDirty();
  expect(dirty.at(-1)).toBe(true);
  fixture.componentRef.setInput('detail', { ...detail, label: 'Fresh authorized projection' });
  await fixture.whenStable();
  expect(component.garageMatches).toBe(true);
  component.discard();
  expect(dirty.at(-1)).toBe(false);
});

it('opens an action without inventing a draft, but protects its entered rejection reason', async () => {
  const { component } = await render();
  const dirty: boolean[] = [];
  component.dirtyChange.subscribe((value) => dirty.push(value));
  component.choose('reject_review');
  expect(dirty.at(-1)).toBe(false);
  component.rejectionReason = 'evidence_not_sufficient';
  component.emitDirty();
  expect(dirty.at(-1)).toBe(true);
  component.rejectionReason = '';
  component.emitDirty();
  expect(dirty.at(-1)).toBe(false);
});
