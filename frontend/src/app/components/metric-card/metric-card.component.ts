import { Component, input } from '@angular/core';

@Component({
    selector: 'app-metric-card',
    standalone: true,
    templateUrl: './metric-card.component.html',
    styleUrls: ['./metric-card.component.css'],
})
export class MetricCardComponent {
    readonly label = input.required<string>();
    readonly value = input.required<string>();
}
