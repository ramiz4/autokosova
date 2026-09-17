import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { LucideLogIn, type LucideIcon } from '@autokosova/icons';
import {
  BrnAlertDialog,
  BrnAlertDialogContent,
  BrnAlertDialogDescription,
  BrnAlertDialogOverlay,
  BrnAlertDialogTitle,
} from '@spartan-ng/brain/alert-dialog';
import { accountCopy } from '../../shared/account-copy';
import { LanguageService } from '../language.service';
import { ButtonDirective } from './button.directive';
import { LucideIconComponent } from './lucide-icon.component';

const copy = {
  de: { title: 'Bitte einloggen', body: 'Melde dich an, um diese Seite zu verwenden.' },
  sq: { title: 'Identifikohu', body: 'Identifikohu për ta përdorur këtë faqe.' },
  en: { title: 'Please sign in', body: 'Sign in to use this page.' },
} as const;

@Component({
  selector: 'app-auth-required-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrnAlertDialog,
    BrnAlertDialogContent,
    BrnAlertDialogDescription,
    BrnAlertDialogOverlay,
    BrnAlertDialogTitle,
    ButtonDirective,
    LucideIconComponent,
  ],
  template: `
    <brn-alert-dialog
      [state]="open() ? 'open' : 'closed'"
      [autoFocus]="'[data-auth-login]'"
      [closeOnOutsidePointerEvents]="false"
    >
      <brn-alert-dialog-overlay class="z-80 bg-slate-950/55 backdrop-blur-sm" />
      <ng-template brnAlertDialogContent>
        <section
          data-auth-required-dialog
          class="app-dialog-panel z-90 w-[min(460px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white p-6 text-center text-ink shadow-2xl shadow-ink/25 sm:p-8"
          (keydown.escape)="$event.preventDefault(); $event.stopPropagation()"
        >
          <span
            class="mx-auto flex size-14 items-center justify-center rounded-full bg-blue-50 text-brand"
            ><lucide-icon [name]="LoginIcon" class="size-7"
          /></span>
          <h2 brnAlertDialogTitle class="mt-5 text-2xl font-bold">{{ text().title }}</h2>
          <p brnAlertDialogDescription class="mt-3 text-sm leading-6 text-muted">
            {{ loginAvailable() ? text().body : unavailableText() }}
          </p>
          @if (loginAvailable()) {
            <a data-auth-login appButton class="mt-6 w-full" [href]="loginUrl()">{{
              language.t('nav.login')
            }}</a>
          }
        </section>
      </ng-template>
    </brn-alert-dialog>
  `,
})
export class AuthRequiredDialogComponent {
  readonly LoginIcon: LucideIcon = LucideLogIn;
  readonly open = input(false);
  readonly loginAvailable = input(true);
  readonly loginUrl = input.required<string>();
  protected readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) return;
      const previous = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      onCleanup(() => (this.document.body.style.overflow = previous));
    });
  }

  protected text() {
    return copy[this.language.language];
  }
  protected unavailableText(): string {
    return accountCopy[this.language.language]['account.loginUnavailable'];
  }
}
