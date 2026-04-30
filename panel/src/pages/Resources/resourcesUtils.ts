import type { ResourceItem } from '@shared/resourcesApiTypes';

export type ResourceGroup = {
    subPath: string;
    resources: ResourceItem[];
};

export function getResourceSubPath(resPath: string): string {
    if (resPath.includes('system_resources')) return 'system_resources';
    // Normalize slashes and collapse double-slashes (GetResourcePath can return resources//)
    const normalized = resPath.replace(/\\/g, '/').replace(/\/+/g, '/');
    // Find the resources/ segment and return what comes after it (minus the resource folder itself)
    const match = normalized.match(/\/resources\/(.+)\/[^/]+\/?$/);
    if (match) {
        const inner = match[1];
        try { return decodeURIComponent(inner) || 'root'; } catch (_) { }
        return inner || 'root';
    }
    return 'root';
}

export function groupResources(resources: ResourceItem[]): ResourceGroup[] {
    const grouped = new Map<string, ResourceItem[]>();
    for (const r of resources) {
        const sub = getResourceSubPath(r.path);
        const arr = grouped.get(sub) ?? [];
        arr.push(r);
        grouped.set(sub, arr);
    }
    return Array.from(grouped.entries())
        .map(([subPath, resources]) => ({
            subPath,
            resources: resources.sort((a, b) => a.displayName.localeCompare(b.displayName)),
        }))
        .sort((a, b) => a.subPath.localeCompare(b.subPath));
}

export const DEFAULT_RESOURCES = new Set([
    'baseevents',
    'basic-gamemode',
    'betaguns',
    'channelfeed',
    'chat-theme-gtao',
    'chat',
    'example-loadscreen',
    'fivem-awesome1501',
    'fivem-map-hipster',
    'fivem-map-skater',
    'fivem',
    'gameInit',
    'hardcap',
    'irc',
    'keks',
    'mapmanager',
    'money-fountain-example-map',
    'money-fountain',
    'money',
    'monitor',
    'obituary-deaths',
    'obituary',
    'ped-money-drops',
    'player-data',
    'playernames',
    'race-test',
    'race',
    'rconlog',
    'redm-map-one',
    'runcode',
    'scoreboard',
    'sessionmanager-rdr3',
    'sessionmanager',
    'spawnmanager',
    'webadmin',
    'webpack',
    'yarn',
]);
