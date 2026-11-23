import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {GridComponent} from '../../grid/grid.component';

/**
 * Dumb component, responsible for presenting "Add worklog" button and delegating the action to the grid component.
 */
@Component({
  standalone: false,
  selector: 'plaid-add-button',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './add-button.component.html'
})
export class AddButtonComponent {
  @Input()
  disabled = false;

  @Input()
  gridComponent: GridComponent;

  click(): void {
    if (!this.disabled) {
      this.gridComponent.addWorklogInTheMiddleOfView();
    }
  }
}
