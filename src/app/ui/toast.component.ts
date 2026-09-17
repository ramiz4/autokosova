import { Component, inject } from '@angular/core';
import { LucideIconComponent } from './lucide-icon.component';
import { LucideCheck, LucideX, LucideInfo, type LucideIcon } from '@autokosova/icons';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  imports: [LucideIconComponent],
  template: `
    @if (toast.current(); as notice) {
      <div
        class="pointer-events-none fixed right-0 bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 z-70 mx-auto flex w-[calc(100%-2rem)] max-w-xl justify-center"
        data-toast
      >
        <div
          role="status"
          class="pointer-events-auto flex w-full items-start gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-sm text-ink shadow-xl shadow-brand/20"
        >
          <span
            class="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full"
            [class.bg-brand/10]="notice.type === 'success'"
            [class.text-brand]="notice.type === 'success'"
            [class.bg-rose-50]="notice.type === 'error'"
            [class.text-rose-600]="notice.type === 'error'"
          >
            <lucide-icon
              [name]="notice.type === 'success' ? checkIcon : infoIcon"
              class="size-4.5"
            />
          </span>
          <span class="flex min-h-11 min-w-0 grow items-center text-sm font-medium leading-5">
            {{ notice.message }}
          </span>
          <button
            type="button"
            class="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-slate-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label="Schließen"
            (click)="toast.dismiss()"
          >
            <lucide-icon [name]="xIcon" class="size-4.5" />
          </button>
        </div>
      </div>
    }
  `,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService);
  readonly checkIcon: LucideIcon = LucideCheck;
  readonly xIcon: LucideIcon = LucideX;
  readonly infoIcon: LucideIcon = LucideInfo;
}
