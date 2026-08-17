import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { NgFor, JsonPipe } from '@angular/common';

type Demo = {
    name: string;
    endpoint: string;
};

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [NgFor, JsonPipe],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
})
export class AppComponent {
    private readonly http = inject(HttpClient);

    readonly title = 'Performance Engineering Lab';
    readonly demos: Demo[] = [
        { name: 'CPU Latency', endpoint: '/api/lab/cpu?ms=120' },
        { name: 'Injected Latency', endpoint: '/api/lab/latency?ms=200' },
        { name: 'Queue Buildup', endpoint: '/api/lab/queue?jobs=100&workers=6' },
        { name: 'Amdahl Law', endpoint: '/api/lab/scaling/amdahl?p=0.92&n=8' },
        { name: 'USL', endpoint: '/api/lab/scaling/usl?n=16&alpha=0.03&beta=0.01' },
        { name: 'DB Indexing On', endpoint: '/api/lab/db/indexing?indexed=true' },
        { name: 'Cache Demo', endpoint: '/api/lab/cache/demo?key=student-42' },
        { name: 'Lock Contention', endpoint: '/api/lab/locks/contention?threads=16' },
    ];

    output: unknown = { info: 'Run a demo to see response...' };
    loading = false;

    run(demo: Demo): void {
        this.loading = true;
        this.http.get(demo.endpoint).subscribe({
            next: (res: unknown) => {
                this.output = { demo: demo.name, response: res };
                this.loading = false;
            },
            error: (err: { message?: string } | unknown) => {
                const message = typeof err === 'object' && err !== null && 'message' in err
                    ? String((err as { message?: string }).message)
                    : String(err);
                this.output = { demo: demo.name, error: message };
                this.loading = false;
            },
        });
    }
}
