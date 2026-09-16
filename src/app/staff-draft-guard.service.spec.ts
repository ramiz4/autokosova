import { TestBed } from '@angular/core/testing';
import { StaffDraftGuardService } from './staff-draft-guard.service';
import { LanguageService } from './language.service';

afterEach(() => vi.restoreAllMocks());

it.each([
  ['de', 'Ungespeicherte Falländerungen verwerfen?'],
  ['en', 'Discard unsaved case changes?'],
  ['sq', 'Të hidhen poshtë ndryshimet e paruajtura të rastit?'],
] as const)(
  'asks once in the active %s locale and clears only after confirmation',
  (language, text) => {
    TestBed.configureTestingModule({
      providers: [{ provide: LanguageService, useValue: { language } }],
    });
    const guard = TestBed.inject(StaffDraftGuardService);
    guard.setDirty(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(guard.confirmDiscard()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(text);
    expect(guard.dirty()).toBe(true);
    confirm.mockReturnValue(true);
    expect(guard.confirmDiscard()).toBe(true);
    expect(guard.dirty()).toBe(false);
    expect(guard.confirmDiscard()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  },
);
