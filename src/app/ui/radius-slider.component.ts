import { Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { REPAIR_REQUEST_LIMITS } from '../../shared/repair-request';
import { LanguageService } from '../language.service';

@Component({
  selector: 'app-radius-slider',
  host: { class: 'block min-w-0' },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadiusSliderComponent),
      multi: true,
    },
  ],
  template: `
    <label [for]="inputId()" class="block text-sm font-semibold text-ink">{{
      language.t('search.ui.radiusValue', { radius: value() })
    }}</label>
    <input
      [id]="inputId()"
      type="range"
      class="radius-slider"
      [min]="limits.minRadiusKm"
      [max]="limits.maxRadiusKm"
      step="1"
      [value]="value()"
      [disabled]="disabled()"
      [style.--radius-progress]="progress()"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-valuetext]="value() + ' km'"
      (input)="update($event)"
      (blur)="onTouched()"
    />
    <div
      class="pointer-events-none flex justify-between text-sm leading-5 text-muted"
      aria-hidden="true"
    >
      <span>{{ limits.minRadiusKm }} km</span><span>{{ limits.maxRadiusKm }} km</span>
    </div>
  `,
  styleUrl: './radius-slider.component.scss',
})
export class RadiusSliderComponent implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly describedBy = input('');
  protected readonly language = inject(LanguageService);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly value = signal(20);
  protected readonly disabled = signal(false);
  protected onTouched: () => void = () => {};
  private onChange: (value: number) => void = () => {};

  protected progress(): string {
    const percent =
      ((this.value() - this.limits.minRadiusKm) /
        (this.limits.maxRadiusKm - this.limits.minRadiusKm)) *
      100;
    return `${Math.max(0, Math.min(100, percent))}%`;
  }

  writeValue(value: number): void {
    this.value.set(Number.isFinite(Number(value)) ? Number(value) : this.limits.minRadiusKm);
  }
  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected update(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.value.set(value);
    this.onChange(value);
  }
}
