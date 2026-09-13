import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoundationComponent } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FoundationComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FoundationComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the public search as the primary landing action', async () => {
    const fixture = TestBed.createComponent(FoundationComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Finde eine passende Werkstatt');
    expect(compiled.textContent).toContain('Werkstatt finden');
    expect(compiled.textContent).toContain('ohne Konto');
  });
});
