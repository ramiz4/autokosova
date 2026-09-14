import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { GarageProfileComponent } from './garage-profile.component';

function routeWith(garageId: string) {
  return { snapshot: { paramMap: convertToParamMap({ garageId }) } };
}

describe('GarageProfileComponent', () => {
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
        imports: [GarageProfileComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: routeWith('fiktive-werkstatt') },
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(GarageProfileComponent);
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
        imports: [GarageProfileComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: routeWith('fiktive-werkstatt') },
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(GarageProfileComponent);
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

  it('keeps local demo contact links inspectable but prevents an external handover', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          contact: { phone: '+383 44 123 456' },
          id: 'demo-prishtina-bremsen',
          languages: ['Deutsch'],
          name: 'DEMO · Bremsen Prishtina',
          photoIds: [],
          placeId: 'xk-pristina',
          selfReportedSpecializations: ['Bremsen'],
          serviceCategoryIds: ['bremsen'],
          vehicleMakeIds: ['skoda'],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    try {
      await TestBed.configureTestingModule({
        imports: [GarageProfileComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: routeWith('demo-prishtina-bremsen') },
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(GarageProfileComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      const whatsAppLink = fixture.nativeElement.querySelector('a[href^="https://wa.me/"]');
      const telephoneLink = fixture.nativeElement.querySelector('a[href^="tel:"]');

      expect(fixture.nativeElement.textContent).toContain('Lokale Demo');
      expect(whatsAppLink).toBeTruthy();
      expect(telephoneLink).toBeTruthy();
      expect(
        whatsAppLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
      ).toBe(false);
      expect(
        telephoneLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
      ).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
