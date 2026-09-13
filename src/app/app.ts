import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CATALOG_PLACES, SERVICE_CATEGORY_LABELS } from '../shared/catalog';
import { REPAIR_REQUEST_LIMITS } from '../shared/repair-request';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {}

@Component({
  imports: [FormsModule, RouterLink],
  templateUrl: './app.html',
})
export class FoundationComponent {
  private readonly router = inject(Router);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly places = CATALOG_PLACES;
  protected readonly services = Object.entries(SERVICE_CATEGORY_LABELS);
  protected placeId = 'xk-pristina';
  protected radiusKm = 20;
  protected serviceCategoryId = '';
  protected searchError = '';

  protected search(): void {
    if (!this.serviceCategoryId) {
      this.searchError = 'Bitte wähle zuerst eine Leistung.';
      return;
    }
    if (
      !Number.isInteger(Number(this.radiusKm)) ||
      this.radiusKm < this.limits.minRadiusKm ||
      this.radiusKm > this.limits.maxRadiusKm
    ) {
      this.searchError = `Der Radius muss zwischen ${this.limits.minRadiusKm} und ${this.limits.maxRadiusKm} km liegen.`;
      return;
    }
    this.searchError = '';
    void this.router.navigate(['/suche'], {
      queryParams: {
        places: `${this.placeId}:${this.radiusKm}`,
        service: this.serviceCategoryId,
      },
    });
  }
}
