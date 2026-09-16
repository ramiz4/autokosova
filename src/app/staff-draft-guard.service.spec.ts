import { TestBed } from '@angular/core/testing';
import { StaffDraftGuardService } from './staff-draft-guard.service';
it('fails closed without its local owner and clears only after that owner confirms', async () => {
  TestBed.configureTestingModule({ providers: [StaffDraftGuardService] });
  const guard = TestBed.inject(StaffDraftGuardService);
  guard.setDirty(true);
  await expect(guard.confirmDiscard()).resolves.toBe(false);
  const reject = vi.fn().mockResolvedValue(false);
  guard.connect(reject);
  await expect(guard.confirmDiscard()).resolves.toBe(false);
  expect(reject).toHaveBeenCalledOnce();
  const accept = vi.fn().mockResolvedValue(true);
  guard.connect(accept);
  await expect(guard.confirmDiscard()).resolves.toBe(true);
  expect(guard.dirty()).toBe(false);
});
