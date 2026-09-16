import { TestBed } from '@angular/core/testing';
import { StaffReturnContextService } from './staff-return-context.service';

it('keeps only a bounded return focus for the same account context and never restores it across a session change', () => {
  const context = TestBed.inject(StaffReturnContextService);
  context.remember('session-a', 'review:case-a', -4.8);
  expect(context.take('session-b')).toBeUndefined();
  context.remember('session-a', 'review:case-a', 420.9);
  expect(context.take('session-a')).toEqual({ caseId: 'review:case-a', scrollY: 420 });
  expect(context.take('session-a')).toBeUndefined();
});

it('defaults deep links to the returned case without overwriting an existing list scroll position', () => {
  const context = TestBed.inject(StaffReturnContextService);
  context.remember('session-a', 'review:deep');
  expect(context.take('session-a')).toEqual({ caseId: 'review:deep', scrollY: 0 });
  context.remember('session-a', 'review:listed', 480);
  context.remember('session-a', 'review:listed');
  expect(context.take('session-a')).toEqual({ caseId: 'review:listed', scrollY: 480 });
});

it('consumes an escalation notice once and never carries it across account contexts', () => {
  const context = new StaffReturnContextService();
  context.rememberEscalation('moderator:1');
  expect(context.takeEscalation('moderator:1')).toBe(true);
  expect(context.takeEscalation('moderator:1')).toBe(false);
  context.rememberEscalation('moderator:1');
  expect(context.takeEscalation('moderator:2')).toBe(false);
  context.rememberEscalation('moderator:1');
  context.clear();
  expect(context.takeEscalation('moderator:1')).toBe(false);
});
