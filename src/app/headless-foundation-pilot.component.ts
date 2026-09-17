import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  signal,
  viewChild,
} from '@angular/core';
import {
  BrnCollapsible,
  BrnCollapsibleContent,
  BrnCollapsibleTrigger,
} from '@spartan-ng/brain/collapsible';
import {
  BrnDialog,
  BrnDialogClose,
  BrnDialogContent,
  BrnDialogOverlay,
  BrnDialogTitle,
  BrnDialogTrigger,
} from '@spartan-ng/brain/dialog';
import { BrnOverlay, BrnOverlayClose, BrnOverlayContent } from '@spartan-ng/brain/overlay';

/**
 * Internal, fixture-only proof for #128. It is not linked from product UI and
 * intentionally contains no product copy, data, forms, or application state.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [
    BrnDialog,
    BrnDialogClose,
    BrnDialogContent,
    BrnDialogOverlay,
    BrnDialogTitle,
    BrnDialogTrigger,
    BrnOverlay,
    BrnOverlayClose,
    BrnOverlayContent,
    BrnCollapsible,
    BrnCollapsibleContent,
    BrnCollapsibleTrigger,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
  ],
  selector: 'app-headless-foundation-pilot',
  styles: [
    `
      .foundation-pilot-panel {
        border: 1px solid #dbe5f2;
        border-radius: 12px;
        background: #fff;
        color: #07143e;
        box-shadow: 0 24px 100px #07143e35;
      }
    `,
  ],
  template: `
    <main data-foundation-pilot>
      <h1>Headless Foundation fixture</h1>

      <brn-dialog
        #dialog="brnDialog"
        [closeOnOutsidePointerEvents]="false"
        [state]="dialogState()"
        (stateChanged)="dialogState.set($event)"
      >
        <button type="button" brnDialogTrigger data-foundation-dialog-trigger>
          Open dialog fixture
        </button>
        <brn-dialog-overlay class="bg-black/80"></brn-dialog-overlay>
        <ng-template brnDialogContent>
          <section class="foundation-pilot-panel p-6" data-foundation-dialog-panel>
            <h2 brnDialogTitle>Dialog fixture</h2>
            <p>Only synthetic Foundation content.</p>
            <button type="button" (click)="openNativeDialog()" data-foundation-native-trigger>
              Open native dialog above this portal
            </button>
            <button type="button" brnDialogClose data-foundation-dialog-close>Close dialog</button>
          </section>
        </ng-template>
      </brn-dialog>

      <brn-overlay
        #belowOverlay="brnOverlay"
        [attachPositions]="overlayPositions"
        [autoFocus]="false"
        [hasBackdrop]="false"
        [role]="null"
        [state]="overlayState()"
        (stateChanged)="overlayState.set($event)"
      >
        <button
          #belowOverlayAnchorElement
          type="button"
          (click)="openBelowOverlay()"
          data-foundation-overlay-trigger="below"
        >
          Open nonmodal overlay fixture
        </button>
        <ng-template brnOverlayContent>
          <section class="foundation-pilot-panel p-4" data-foundation-overlay-panel="below">
            <p>Generic overlay: no dialog role and no focus trap.</p>
            <button type="button" brnOverlayClose data-foundation-overlay-close>
              Close overlay
            </button>
          </section>
        </ng-template>
      </brn-overlay>

      <brn-overlay
        #aboveOverlay="brnOverlay"
        [attachPositions]="overlayPositions"
        [autoFocus]="false"
        [hasBackdrop]="false"
        [role]="null"
        [state]="aboveOverlayState()"
        (stateChanged)="aboveOverlayState.set($event)"
      >
        <button
          #aboveOverlayAnchorElement
          type="button"
          (click)="openAboveOverlay()"
          class="fixed bottom-3 left-3"
          data-foundation-overlay-trigger="above"
        >
          Open above overlay fixture
        </button>
        <ng-template brnOverlayContent>
          <section class="foundation-pilot-panel p-4" data-foundation-overlay-panel="above">
            <p>Fallback above the explicit lower viewport anchor.</p>
            <button type="button" brnOverlayClose>Close overlay</button>
          </section>
        </ng-template>
      </brn-overlay>

      <section brnCollapsible>
        <button type="button" brnCollapsibleTrigger data-foundation-collapsible-trigger>
          Toggle collapsible fixture
        </button>
        <div brnCollapsibleContent data-foundation-collapsible-content>
          Collapsible fixture content
        </div>
      </section>

      <button type="button" [cdkMenuTriggerFor]="actionsMenu" data-foundation-menu-trigger>
        Open action-menu fixture
      </button>
      <ng-template #actionsMenu>
        <div cdkMenu class="foundation-pilot-panel p-2" data-foundation-menu>
          <button type="button" cdkMenuItem data-foundation-menu-item>Fixture action</button>
          <button type="button" cdkMenuItem data-foundation-menu-close>Close with Escape</button>
        </div>
      </ng-template>

      <dialog #nativeDialog data-foundation-native-dialog>
        <h2>Native top-layer fixture</h2>
        <button type="button" (click)="closeNativeDialog()" data-foundation-native-close>
          Close native dialog
        </button>
      </dialog>
    </main>
  `,
})
export class HeadlessFoundationPilotComponent {
  readonly dialogState = signal<'closed' | 'open'>('closed');
  readonly aboveOverlayState = signal<'closed' | 'open'>('closed');
  readonly overlayState = signal<'closed' | 'open'>('closed');
  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  ];
  protected readonly aboveOverlayAnchor = viewChild<ElementRef<HTMLElement>>(
    'aboveOverlayAnchorElement',
  );
  protected readonly belowOverlayAnchor = viewChild<ElementRef<HTMLElement>>(
    'belowOverlayAnchorElement',
  );
  private readonly aboveOverlay = viewChild.required<BrnOverlay>('aboveOverlay');
  private readonly belowOverlay = viewChild.required<BrnOverlay>('belowOverlay');
  private readonly nativeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('nativeDialog');

  protected openBelowOverlay(): void {
    this.belowOverlay().setOrigin(this.belowOverlayAnchor()?.nativeElement);
    this.belowOverlay().open();
  }

  protected openAboveOverlay(): void {
    this.aboveOverlay().setOrigin(this.aboveOverlayAnchor()?.nativeElement);
    this.aboveOverlay().open();
  }

  protected openNativeDialog(): void {
    this.nativeDialog().nativeElement.showModal();
  }

  protected closeNativeDialog(): void {
    this.nativeDialog().nativeElement.close();
  }
}
