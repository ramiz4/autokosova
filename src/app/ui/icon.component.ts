import { Component, input } from '@angular/core';

export type IconName =
  | 'star'
  | 'pencil'
  | 'info'
  | 'arrow'
  | 'check'
  | 'badge-check'
  | 'shield'
  | 'clock'
  | 'thumb'
  | 'menu'
  | 'close'
  | 'search'
  | 'chevron-down'
  | 'bell'
  | 'user'
  | 'heart'
  | 'heart-filled'
  | 'pin';

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
    <path
      [attr.d]="paths[name()]"
      [attr.fill]="
        name() === 'star' ||
        name() === 'badge-check' ||
        name() === 'heart-filled' ||
        name() === 'bell' ||
        name() === 'user'
          ? 'currentColor'
          : 'none'
      "
    />
    @if (name() === 'badge-check') {
      <path d="m8 12 2.5 2.5 5-5" fill="none" stroke="white" stroke-width="2" />
    }
  </svg>`,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  protected readonly paths: Record<IconName, string> = {
    star: 'm12 2 3 6.1 6.7 1-4.85 4.7 1.15 6.7L12 17.3l-6 3.2 1.15-6.7L2.3 9.1l6.7-1L12 2Z',
    pencil: 'm16 3 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-4-4L5 15l-1 5Z',
    info: 'M12 16v-4m0-4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
    bell: 'M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9Zm4 11h4',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21v-2a7 7 0 0 1 14 0v2H5Z',
    'badge-check':
      'M12 1.5 15.25 4.15 19.42 4.58 19.85 8.75 22.5 12 19.85 15.25 19.42 19.42 15.25 19.85 12 22.5 8.75 19.85 4.58 19.42 4.15 15.25 1.5 12 4.15 8.75 4.58 4.58 8.75 4.15Z',
    'chevron-down': 'm6 9 6 6 6-6',
    heart:
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z',
    'heart-filled':
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z',
    pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
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
