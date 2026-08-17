import { Component, input } from '@angular/core';

@Component({
    selector: 'app-status-item',
    standalone: true,
    templateUrl: './status-item.component.html',
    styleUrls: ['./status-item.component.css'],
})
export class StatusItemComponent {
    readonly label = input.required<string>();
    readonly healthy = input.required<boolean>();
}
