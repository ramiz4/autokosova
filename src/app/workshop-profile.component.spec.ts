import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { WorkshopProfileComponent } from './workshop-profile.component';

function routeWith(workshopId: string) {
  return { snapshot: { paramMap: convertToParamMap({ workshopId }) } };
}

describe('WorkshopProfileComponent', () => {
  it('shows a reviewed profile and a contact preview without unrequested private details', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          contact: { phone: '+383 44 123 456' },
          id: 'fiktive-werkstatt',
          languages: ['Deutsch', 'Shqip'],
          name: 'Fiktive Werkstatt Pejë',
          photoIds: [],
          placeId: 'xk-peja',
          selfReportedSpecializations: ['Bremsen'],
          serviceCategoryIds: ['bremsen'],
          vehicleMakeIds: [],
          verificationLabel: 'Unternehmensdaten geprüft',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    try {
      await TestBed.configureTestingModule({
        imports: [WorkshopProfileComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: routeWith('fiktive-werkstatt') },
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(WorkshopProfileComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Fiktive Werkstatt Pejë');
      expect(text).toContain('Unternehmensdaten geprüft');
      expect(text).toContain('Noch keine Bewertungen');
      expect(text).toContain('Nichts aus einer gespeicherten Anfrage wird automatisch übernommen.');
      expect(fixture.nativeElement.querySelector('a[href^="https://wa.me/"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('a[href="#kontakt"]')).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('withholds external actions for a malformed public telephone value', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          contact: { phone: 'not-a-phone' },
          id: 'fiktive-werkstatt',
          languages: [],
          name: 'Fiktive Werkstatt',
          photoIds: [],
          placeId: 'xk-pristina',
          selfReportedSpecializations: [],
          serviceCategoryIds: ['bremsen'],
          vehicleMakeIds: [],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    try {
      await TestBed.configureTestingModule({
        imports: [WorkshopProfileComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: routeWith('fiktive-werkstatt') },
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(WorkshopProfileComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'keine gültige öffentliche Telefonnummer',
      );
      expect(fixture.nativeElement.querySelector('a[href^="https://wa.me/"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('a[href^="tel:"]')).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
