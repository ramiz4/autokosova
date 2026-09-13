import { TestBed } from '@angular/core/testing';
import { FoundationComponent } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FoundationComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FoundationComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the technical foundation smoke text', async () => {
    const fixture = TestBed.createComponent(FoundationComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('AutoKosova');
    expect(compiled.textContent).toContain('Lokaler App-Smoke-Test bereit.');
  });
});
