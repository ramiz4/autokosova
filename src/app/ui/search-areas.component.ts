import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CATALOG_PLACES } from '../../shared/catalog';
import { REPAIR_REQUEST_LIMITS } from '../../shared/repair-request';
import { LanguageService } from '../language.service';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';
import { RadiusSliderComponent } from './radius-slider.component';

export interface SearchArea {
  placeId: string;
  radiusKm: number;
}

@Component({
  selector: 'app-search-areas',
  host: { class: 'block min-w-0' },
  imports: [FormsModule, ButtonDirective, IconComponent, RadiusSliderComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchAreasComponent),
      multi: true,
    },
  ],
  templateUrl: './search-areas.component.html',
})
export class SearchAreasComponent implements ControlValueAccessor {
  readonly idPrefix = input.required<string>();
  readonly editingChange = output<boolean>();
  protected readonly disabled = signal(false);
  private readonly value = signal<SearchArea[]>([]);
  protected get areas(): SearchArea[] {
    return this.value();
  }
  protected set areas(value: SearchArea[]) {
    this.value.set(value);
    this.onChange(value.map((area) => ({ ...area })));
    this.onTouched();
  }
  protected readonly areaEditor = signal<{ index: number; area: SearchArea } | null>(null);
  protected readonly areaEditorError = signal(false);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly places = CATALOG_PLACES;
  private readonly language = inject(LanguageService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private onChange: (value: SearchArea[]) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: readonly SearchArea[] | null): void {
    this.value.set(
      Array.isArray(value)
        ? value
            .filter(
              (area) =>
                area &&
                typeof area.placeId === 'string' &&
                area.placeId &&
                typeof area.radiusKm === 'number',
            )
            .map((area) => ({ ...area }))
        : [],
    );
    this.cancelArea(false);
  }
  registerOnChange(fn: (value: SearchArea[]) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) this.cancelArea(false);
  }
  protected id(suffix: string): string {
    return `${this.idPrefix()}-${suffix}`;
  }
  protected ui(key: string, replacements?: Record<string, string | number>): string {
    return this.language.t(key, replacements);
  }
  protected placeLabel(placeId: string): string {
    return this.places.find((place) => place.id === placeId)?.label ?? placeId;
  }
  public focusEditor(): void {
    this.focusAreaControl('area-place');
  }
  protected addArea(): void {
    if (this.disabled()) return;
    if (this.areas.length >= this.limits.maxAreas) return;
    this.areaEditor.set({ index: -1, area: { placeId: '', radiusKm: 20 } });
    this.areaEditorError.set(false);
    this.editingChange.emit(true);
    this.focusEditor();
  }
  protected editArea(index: number): void {
    if (this.disabled()) return;
    if (!this.areas[index]) return;
    this.areaEditor.set({ index, area: { ...this.areas[index] } });
    this.areaEditorError.set(false);
    this.editingChange.emit(true);
    this.focusEditor();
  }
  public cancelArea(restoreFocus = true): void {
    const wasOpen = this.areaEditor() !== null;
    const index = this.areaEditor()?.index ?? -1;
    this.areaEditor.set(null);
    this.areaEditorError.set(false);
    if (wasOpen) this.editingChange.emit(false);
    if (restoreFocus) this.focusAreaControl(index < 0 ? 'add-area' : `edit-area-${index}`);
  }
  protected saveArea(): void {
    if (this.disabled()) return;
    const editor = this.areaEditor();
    if (!editor) return;
    const { index, area } = editor;
    if (
      !this.places.some((place) => place.id === area.placeId) ||
      this.placeSelectedElsewhere(area.placeId, index) ||
      !Number.isInteger(area.radiusKm) ||
      area.radiusKm < this.limits.minRadiusKm ||
      area.radiusKm > this.limits.maxRadiusKm ||
      (index < 0 && this.areas.length >= this.limits.maxAreas)
    ) {
      this.areaEditorError.set(true);
      return;
    }
    const savedIndex = index < 0 ? this.areas.length : index;
    this.areas =
      index < 0
        ? [...this.areas, { ...area }]
        : this.areas.map((existing, current) => (current === index ? { ...area } : existing));
    this.cancelArea(false);
    this.focusAreaControl(`edit-area-${savedIndex}`);
  }
  protected placeSelectedElsewhere(placeId: string, index: number): boolean {
    return this.areas.some((area, current) => current !== index && area.placeId === placeId);
  }
  protected removeArea(index: number): void {
    if (this.disabled()) return;
    if (!this.areas[index]) return;
    this.areas = this.areas.filter((_, current) => current !== index);
    const editor = this.areaEditor();
    if (editor?.index === index) this.cancelArea(false);
    else if (editor && editor.index > index)
      this.areaEditor.set({ ...editor, index: editor.index - 1 });
    this.focusAreaControl(
      this.areaEditor()
        ? 'area-place'
        : this.areas.length
          ? `edit-area-${Math.min(index, this.areas.length - 1)}`
          : 'add-area',
    );
  }
  private focusAreaControl(id: string): void {
    if (!this.browser) return;
    afterNextRender(
      () => this.element.nativeElement.querySelector<HTMLElement>(`#${this.id(id)}`)?.focus(),
      { injector: this.injector },
    );
  }
}
