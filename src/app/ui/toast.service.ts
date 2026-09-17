import { Injectable, signal } from '@angular/core';

export interface Toast {
  message: string;
  type: 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<Toast | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, type: Toast['type'] = 'success'): void {
    clearTimeout(this.timer);
    this.current.set({ message, type });
    this.timer = setTimeout(() => this.dismiss(), 5000);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.current.set(null);
  }
}
