export type WatcherFilterMode = 'all' | 'include' | 'exclude';

export type WatcherConfig = {
    enabled: boolean;
    filterMode: WatcherFilterMode;
    patterns: string[];
    disabledAt?: number; // unix ms - set when disabled, cleared when re-enabled, used for stale cleanup
};

export type WatcherConfigs = {
    [resourceName: string]: WatcherConfig;
};

// Resource item as stored in FxResources - includes path for subpath grouping
export type ResourceItem = {
    name: string;        // raw FXServer identifier (may be URL-encoded, e.g. "res%20name")
    displayName: string; // decoded for display (e.g. "res name")
    status: 'started' | 'stopped';
    path: string;
    pathMissing: boolean; // true if the resource directory no longer exists on disk
    version: string;
    author: string;
    description: string;
};

// What the resources socket room sends (initial + every push)
export type ResourcesRoomEventData = {
    resources: ResourceItem[];
    watchers: WatcherConfigs;
};
