import { Component, input } from '@angular/core';
import { NgFor } from '@angular/common';

@Component({
    selector: 'app-chart-panel',
    standalone: true,
    imports: [NgFor],
    templateUrl: './chart-panel.component.html',
    styleUrls: ['./chart-panel.component.css'],
})
export class ChartPanelComponent {
    readonly title = input.required<string>();
    readonly subtitle = input.required<string>();
    readonly points = input.required<number[]>();
}
