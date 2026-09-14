import { TestBed } from '@angular/core/testing';
import { RatingStarsComponent } from './rating-stars.component';

it('renders five accessible stars with fractional fill', async () => {
  await TestBed.configureTestingModule({ imports: [RatingStarsComponent] }).compileComponents();
  const fixture = TestBed.createComponent(RatingStarsComponent);
  fixture.componentRef.setInput('rating', 2.7);
  fixture.componentRef.setInput('label', '2.7 von 5');
  fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  const stars = page.querySelectorAll('[role="img"] > span');
  expect(stars).toHaveLength(5);
  expect(
    [...page.querySelectorAll<HTMLElement>('[role="img"] > span > span')].map(
      (star) => star.style.width,
    ),
  ).toEqual(['100%', '100%', '70%', '0%', '0%']);
  expect(page.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('2.7 von 5');
});
