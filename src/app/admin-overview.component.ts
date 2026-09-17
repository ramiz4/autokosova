import { adminLabel } from '../shared/admin-copy';
import type { AdminOverview } from '../shared/administration';
import {
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { StaffLayoutComponent } from './staff-layout.component';
import { ButtonDirective } from './ui/button.directive';
import { staffCopy } from '../shared/staff-copy';

/** `/admin`: domain-named counters and direct entry points, not a case queue. */
@Component({
  selector: 'app-admin-overview',
  imports: [StaffLayoutComponent, RouterLink, ButtonDirective],
  templateUrl: './admin-overview.component.html',
})
export class AdminOverviewComponent {
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  readonly copy = computed(() => staffCopy(this.language.language));
  readonly allowed = computed(() => this.account.identity()?.roles.includes('admin') ?? false);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly overview = signal<AdminOverview | null>(null);
  private generation = 0;
  private controller?: AbortController;
  adminLabel(key: string): string {
    return adminLabel(key, this.language.language);
  }
  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
    });
    effect(() => {
      const context = this.account.dataContext();
      const ready = this.ready();
      const allowed = this.allowed();
      this.generation++;
      this.controller?.abort();
      this.overview.set(null);
      this.error.set('');
      this.loading.set(false);
      if (context && ready && allowed) untracked(() => void this.load());
    });
    effect(() => this.language.setPageText(this.copy().admin, this.adminLabel('intro'), true));
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller?.abort();
    });
  }
  loginUrl(): string {
    return '/auth/login?returnTo=' + encodeURIComponent(this.router.url);
  }
  async load(): Promise<void> {
    if (!this.allowed()) return;
    const generation = ++this.generation;
    this.controller?.abort();
    this.controller = new AbortController();
    const context = this.account.dataContext();
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await fetch('/api/admin/management/overview', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: this.controller.signal,
      });
      if (!response.ok) throw response.status;
      const data = (await response.json()) as AdminOverview;
      if (generation === this.generation && context === this.account.dataContext())
        this.overview.set(data);
    } catch {
      if (generation === this.generation && context === this.account.dataContext())
        this.error.set(this.copy().error);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
