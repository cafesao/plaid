import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

/**
 * Dumb component, presents background to the grid.
 */
@Component({
  standalone: false,
  selector: 'plaid-grid-background',
  templateUrl: './grid-background.component.html',
  styleUrls: ['./grid-background.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GridBackgroundComponent {
  readonly hoursLabels: string[] = Array.from<string>({ length: 24 }).map((_, i) =>
    new Date(1970, 0, 1, i).toLocaleTimeString(undefined, { hour: 'numeric' })
  );
  readonly minutesGrid: null[] = Array.from<null>({ length: 144 }).map(() => null);
  weekdays: null[];

  @Input()
  pixelsPerMinute;
  @Input()
  set numberOfWeekdays(num: number) {
    this.weekdays = Array.from<null>({ length: num }).map(() => null);
  }
}
