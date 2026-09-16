import { Component, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  LucideEllipsis,
  LucideHeart,
  LucideHouse,
  LucideStar,
  type LucideIcon,
} from '@lucide/angular';
import { LucideIconComponent } from './lucide-icon.component';

@Component({
  imports: [LucideIconComponent],
  template: `
    <button
      aria-label="Favorite"
      [attr.aria-pressed]="favorite()"
      (click)="favorite.set(!favorite())"
    >
      <lucide-icon
        [name]="selectedIcon()"
        class="size-5 text-brand"
        [style.--lucide-fill]="favorite() ? 'currentColor' : 'none'"
      />
    </button>
    <lucide-icon [name]="StarIcon" class="size-4 text-amber-500 [--lucide-fill:currentColor]" />
    <lucide-icon [name]="EllipsisIcon" class="size-6" [strokeWidth]="4" />
  `,
})
class IconHost {
  readonly HomeIcon: LucideIcon = LucideHouse;
  readonly HeartIcon: LucideIcon = LucideHeart;
  readonly StarIcon: LucideIcon = LucideStar;
  readonly EllipsisIcon: LucideIcon = LucideEllipsis;
  readonly favorite = signal(false);
  readonly selectedIcon = computed<LucideIcon>(() =>
    this.favorite() ? this.HeartIcon : this.HomeIcon,
  );
}

beforeEach(() =>
  TestBed.configureTestingModule({
    imports: [IconHost],
    providers: [provideZonelessChangeDetection()],
  }),
);

it('renders imported icons without registration and keeps styling on the host', async () => {
  const fixture = TestBed.createComponent(IconHost);
  await fixture.whenStable();
  const host = fixture.nativeElement.querySelector('lucide-icon') as HTMLElement;
  expect(host.classList.contains('size-5')).toBe(true);
  expect(host.classList.contains('text-brand')).toBe(true);
  expect(host.getAttribute('aria-hidden')).toBe('true');
  const svg = host.querySelector('svg')!;
  expect(svg.classList.contains('lucide-house')).toBe(true);
  expect(svg.classList.contains('size-full')).toBe(true);
  expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
  expect(svg.getAttribute('focusable')).toBe('false');
  expect(svg.getAttribute('stroke')).toBe('currentColor');
  expect(svg.getAttribute('stroke-width')).toBe('2');
  expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
});

it('reacts to signal writes without manually forcing change detection', async () => {
  const fixture = TestBed.createComponent(IconHost);
  await fixture.whenStable();
  fixture.componentInstance.favorite.set(true);
  await fixture.whenStable();
  const host = fixture.nativeElement.querySelector('lucide-icon') as HTMLElement;
  expect(host.querySelector('svg')!.classList.contains('lucide-heart')).toBe(true);
  expect(host.style.getPropertyValue('--lucide-fill')).toBe('currentColor');
  expect(fixture.nativeElement.querySelector('button').getAttribute('aria-pressed')).toBe('true');
  fixture.nativeElement.querySelector('button').click();
  await fixture.whenStable();
  expect(host.querySelector('svg')!.classList.contains('lucide-house')).toBe(true);
});

it('does not leak icon or fill state between component instances', async () => {
  const first = TestBed.createComponent(IconHost);
  const second = TestBed.createComponent(IconHost);
  await Promise.all([first.whenStable(), second.whenStable()]);
  first.componentInstance.favorite.set(true);
  await Promise.all([first.whenStable(), second.whenStable()]);
  expect(first.nativeElement.querySelector('svg').classList.contains('lucide-heart')).toBe(true);
  expect(second.nativeElement.querySelector('svg').classList.contains('lucide-house')).toBe(true);
  expect(
    second.nativeElement.querySelector('lucide-icon').style.getPropertyValue('--lucide-fill'),
  ).toBe('none');
});

it('preserves filled rating stars and the accessible action-menu stroke weight', async () => {
  const fixture = TestBed.createComponent(IconHost);
  await fixture.whenStable();
  const icons = fixture.nativeElement.querySelectorAll('lucide-icon') as NodeListOf<HTMLElement>;
  expect(icons[1].classList.contains('[--lucide-fill:currentColor]')).toBe(true);
  expect(icons[1].querySelector('svg')!.classList.contains('lucide-star')).toBe(true);
  expect(icons[2].querySelector('svg')!.getAttribute('stroke-width')).toBe('4');
  expect(icons[2].querySelectorAll('circle')).toHaveLength(3);
});
