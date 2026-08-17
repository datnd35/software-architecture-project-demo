export type ScenarioOption = {
    id: string;
    label: string;
    enabled: boolean;
};

export type SystemStatusItem = {
    label: string;
    healthy: boolean;
};

export type MetricItem = {
    label: string;
    value: string;
};

export type ChartItem = {
    title: string;
    subtitle: string;
    points: number[];
};
