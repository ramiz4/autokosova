import { Component, input } from '@angular/core';

export type IconName =
  'arrow' | 'check' | 'shield' | 'clock' | 'thumb' | 'menu' | 'close' | 'search' | 'chevron-down';

@Component({
  selector: 'app-icon',
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-full w-full"
    focusable="false"
  >
    <path [attr.d]="paths[name()]" />
  </svg>`,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  protected readonly paths: Record<IconName, string> = {
    'chevron-down': 'm6 9 6 6 6-6',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    check: 'm5 12 4 4L19 6',
    shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-5 10 3 3 7-7',
    clock: 'M12 8v5l4 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
    thumb:
      'M7 10H3v11h4V10Zm0 10 3 1h7a3 3 0 0 0 3-2l2-7a2 2 0 0 0-2-3h-6l1-4c0-2-1-3-3-3l-2 5-3 4',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M6 18 18 6',
    search: 'M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',
  };
}
