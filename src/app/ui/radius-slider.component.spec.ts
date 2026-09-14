import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { RadiusSliderComponent } from './radius-slider.component';

@Component({
  imports: [RadiusSliderComponent, ReactiveFormsModule],
  template: '<app-radius-slider inputId="test-radius" [formControl]="radius" />',
})
class Host {
  readonly radius = new FormControl(30, { nonNullable: true });
}

it('keeps the radius label, native range and form control synchronized', async () => {
  await TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  const input = page.querySelector('input')!;
  expect(input.type).toBe('range');
  expect([input.min, input.max, input.step]).toEqual(['5', '100', '1']);
  expect(page.querySelector('label')?.textContent).toContain('Radius: 30 km');
  expect(input.value).toBe('30');
  input.value = '75';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(fixture.componentInstance.radius.value).toBe(75);
  expect(page.querySelector('label')?.textContent).toContain('Radius: 75 km');
  expect(input.getAttribute('aria-valuetext')).toBe('75 km');
  input.dispatchEvent(new Event('blur'));
  expect(fixture.componentInstance.radius.touched).toBe(true);
  fixture.componentInstance.radius.setValue(5);
  await fixture.whenStable();
  expect(input.value).toBe('5');
  fixture.componentInstance.radius.disable();
  await fixture.whenStable();
  expect(input.disabled).toBe(true);
});
