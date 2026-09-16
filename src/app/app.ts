import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteFooterComponent } from './site-footer.component';

@Component({
  imports: [RouterOutlet, SiteFooterComponent],
  selector: 'app-root',
  template: `
    <router-outlet #page="outlet" />
    @if (!page.isActivated || !page.activatedRouteData['ownsFooter']) {
      <app-site-footer />
    }
  `,
})
export class App {}
