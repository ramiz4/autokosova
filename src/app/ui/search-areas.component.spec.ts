import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SearchAreasComponent, type SearchArea } from './search-areas.component';

async function editorFixture(value: SearchArea[] = []) {
  await TestBed.configureTestingModule({
    imports: [SearchAreasComponent],
    providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: 'server' }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SearchAreasComponent);
  fixture.componentRef.setInput('idPrefix', 'test');
  fixture.componentInstance.writeValue(value);
  fixture.detectChanges();
  return fixture;
}

it('commits edits only on Apply and discards drafts on Cancel or an external value update', async () => {
  const fixture = await editorFixture([{ placeId: 'xk-prizren', radiusKm: 30 }]);
  const component = fixture.componentInstance;
  const changed = vi.fn(),
    touched = vi.fn();
  component.registerOnChange(changed);
  component.registerOnTouched(touched);
  component['editArea'](0);
  component['areaEditor']()!.area.radiusKm = 75;
  expect(component['areas'][0].radiusKm).toBe(30);
  expect(changed).not.toHaveBeenCalled();
  component.cancelArea();
  expect(changed).not.toHaveBeenCalled();
  component['editArea'](0);
  component['areaEditor']()!.area.radiusKm = 75;
  component['saveArea']();
  expect(changed).toHaveBeenLastCalledWith([{ placeId: 'xk-prizren', radiusKm: 75 }]);
  expect(touched).toHaveBeenCalledOnce();
  component['editArea'](0);
  component.writeValue([{ placeId: 'xk-peja', radiusKm: 50 }]);
  expect(component['areaEditor']()).toBeNull();
  expect(changed).toHaveBeenCalledOnce();
});

it('validates new chips, keeps only one draft, and allows clearing the final location', async () => {
  const component = (await editorFixture([{ placeId: 'xk-prizren', radiusKm: 30 }]))
    .componentInstance;
  component['addArea']();
  expect(component['areas']).toHaveLength(1);
  expect(component['areaEditor']()!.area.placeId).toBe('');
  component['saveArea']();
  expect(component['areaEditorError']()).toBe(true);
  component['areaEditor']()!.area = { placeId: 'xk-prizren', radiusKm: 40 };
  component['saveArea']();
  expect(component['areas']).toHaveLength(1);
  component['areaEditor']()!.area = { placeId: 'xk-peja', radiusKm: 101 };
  component['saveArea']();
  expect(component['areas']).toHaveLength(1);
  component['areaEditor']()!.area.radiusKm = 50;
  component['saveArea']();
  component['addArea']();
  component['areaEditor']()!.area = { placeId: 'xk-ferizaj', radiusKm: 10 };
  component['saveArea']();
  component['addArea']();
  expect(component['areaEditor']()).toBeNull();
  expect(component['areas']).toHaveLength(3);
  component['editArea'](2);
  component['removeArea'](0);
  expect(component['areaEditor']()!.index).toBe(1);
  component['areaEditor']()!.area.radiusKm = 60;
  component['saveArea']();
  expect(component['areas'][1]).toEqual({ placeId: 'xk-ferizaj', radiusKm: 60 });
  component['removeArea'](1);
  component['editArea'](0);
  component['removeArea'](0);
  expect(component['areaEditor']()).toBeNull();
  expect(component['areas']).toEqual([]);
  component['addArea']();
  component['cancelArea']();
  expect(component['areas']).toEqual([]);
});

it('renders distinct edit/remove buttons and supports Escape and disabled form controls', async () => {
  const fixture = await editorFixture([
    { placeId: 'xk-prizren', radiusKm: 30 },
    { placeId: 'xk-peja', radiusKm: 50 },
  ]);
  const component = fixture.componentInstance,
    page = fixture.nativeElement as HTMLElement;
  page.querySelector<HTMLButtonElement>('#test-edit-area-0')!.click();
  fixture.detectChanges();
  expect(page.querySelectorAll('#test-area-editor')).toHaveLength(1);
  expect(
    page.querySelector<HTMLOptionElement>('#test-area-place option[value="xk-peja"]')!.disabled,
  ).toBe(true);
  component['areaEditor']()!.area.radiusKm = 80;
  page
    .querySelector('#test-area-editor')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
  expect(component['areas'][0].radiusKm).toBe(30);
  expect(page.querySelector('#test-area-editor')).toBeNull();
  component.setDisabledState(true);
  fixture.detectChanges();
  expect([...page.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  component['removeArea'](0);
  component['addArea']();
  expect(component['areas']).toHaveLength(2);
  expect(component['areaEditor']()).toBeNull();
});

it('removes the intended chips when clicks precede the next render and shows the shared empty state', async () => {
  const fixture = await editorFixture([
    { placeId: 'xk-prizren', radiusKm: 30 },
    { placeId: 'xk-peja', radiusKm: 50 },
    { placeId: 'xk-ferizaj', radiusKm: 10 },
  ]);
  const component = fixture.componentInstance,
    page = fixture.nativeElement as HTMLElement;
  page.querySelector<HTMLButtonElement>('[aria-label="Prizren entfernen"]')!.click();
  page.querySelector<HTMLButtonElement>('[aria-label="Pejë entfernen"]')!.click();
  expect(component['areas']).toEqual([{ placeId: 'xk-ferizaj', radiusKm: 10 }]);
  fixture.detectChanges();
  page.querySelector<HTMLButtonElement>('[aria-label="Ferizaj entfernen"]')!.click();
  fixture.detectChanges();
  expect(component['areas']).toEqual([]);
  expect(page.textContent).toContain('Ganz Kosovo');
});
