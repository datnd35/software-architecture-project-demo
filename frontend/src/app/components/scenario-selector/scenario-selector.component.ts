import { Component, input, output } from '@angular/core';
import { NgFor } from '@angular/common';
import { ScenarioOption } from '../../models/dashboard.model';

@Component({
    selector: 'app-scenario-selector',
    standalone: true,
    imports: [NgFor],
    templateUrl: './scenario-selector.component.html',
    styleUrls: ['./scenario-selector.component.css'],
})
export class ScenarioSelectorComponent {
    readonly options = input.required<ScenarioOption[]>();
    readonly selectedId = input.required<string>();
    readonly selectedChange = output<string>();

    onChange(value: string): void {
        this.selectedChange.emit(value);
    }
}
