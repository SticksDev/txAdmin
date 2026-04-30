const modulename = 'FxResources';
import fs from 'node:fs';
import path from 'node:path';
import { cloneDeep } from 'lodash-es';
import consoleFactory from '@lib/console';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
import { Stopwatch } from './FxMonitor/utils';
import type { ResourceItem, ResourcesRoomEventData } from '@shared/resourcesApiTypes';
const console = consoleFactory(modulename);


type ResourceEventType = {
    type: 'txAdminResourceEvent';
    resource: string;
    event: 'onResourceStarting'
    | 'onResourceStart'
    | 'onServerResourceStart'
    | 'onResourceListRefresh'
    | 'onResourceStop'
    | 'onServerResourceStop';
};

type ResPendingStartState = {
    name: string;
    time: Stopwatch;
}

type ResBootLogEntry = {
    tsBooted: number;
    resource: string;
    duration: number;
};


/**
 * Module responsible for tracking FXServer resource states.
 * Maintains a stateful map of all resources, updated via:
 * - Full list from the intercom (txaReportResources response)
 * - Individual start/stop events from FD3
 */
export default class FxResources {
    // Stateful resource map: name -> ResourceItem
    private resourceMap = new Map<string, ResourceItem>();

    // Boot tracking
    private resBooting: ResPendingStartState | null = null;
    private resBootLog: ResBootLogEntry[] = [];
    private prevBootLog: ResBootLogEntry[] | null = null;


    /**
     * Reset state on server close
     */
    handleServerClose() {
        if (this.resBootLog.length > 0) {
            this.prevBootLog = this.resBootLog;
        }
        this.resBootLog = [];
        this.resBooting = null;
        this.resourceMap.clear();
        this.pushSocketData();
    }


    /**
     * Handler for all txAdminResourceEvent FD3 events
     */
    handleServerEvents(payload: ResourceEventType, mutex: string) {
        const { resource, event } = payload;
        if (!event) {
            console.verbose.error(`Invalid txAdminResourceEvent payload: ${JSON.stringify(payload)}`);
            return;
        }
        // onResourceListRefresh doesn't carry a resource name; all others do
        if (event !== 'onResourceListRefresh' && !resource) {
            console.verbose.error(`Invalid txAdminResourceEvent payload (missing resource): ${JSON.stringify(payload)}`);
            return;
        }

        if (event === 'onResourceStarting') {
            this.resBooting = {
                name: resource,
                time: new Stopwatch(true),
            };

        } else if (event === 'onResourceStart') {
            if (this.resBooting?.name === resource) {
                this.resBootLog.push({
                    resource,
                    duration: this.resBooting.time.elapsedMs ?? -1,
                    tsBooted: Date.now(),
                });
            } else {
                if (resource !== 'monitor') {
                    console.verbose.warn(`Resource ${resource} started while ${this.resBooting?.name ?? 'unknown'} was booting`);
                }
                this.resBootLog.push({ resource, duration: -1, tsBooted: Date.now() });
            }
            this.updateResourceStatus(resource, 'started');

        } else if (event === 'onServerResourceStart') {
            this.updateResourceStatus(resource, 'started');
            // Once the monitor resource is running, request the full resource list so
            // watchers (and the UI) get accurate path data without needing a page visit.
            if (resource === 'monitor') {
                txCore.fxRunner.sendCommand('txaReportResources', [], SYM_SYSTEM_AUTHOR);
            }

        } else if (event === 'onResourceStop' || event === 'onServerResourceStop') {
            this.updateResourceStatus(resource, 'stopped');

        } else if (event === 'onResourceListRefresh') {
            // The resource list was refreshed (e.g. from a `refresh` command).
            // Fetch fresh metadata for all resources.
            txCore.fxRunner.sendCommand('txaReportResources', [], SYM_SYSTEM_AUTHOR);
        }
    }


    /**
     * Update a single resource's status and push a socket notification.
     * Only updates if the resource is already known; unknown resources get
     * populated on the next full list fetch.
     */
    private updateResourceStatus(name: string, status: 'started' | 'stopped') {
        const existing = this.resourceMap.get(name);
        if (existing && existing.status !== status) {
            existing.status = status;
            this.pushSocketData();
        }
    }


    /**
     * Push the current resource list + watcher configs to the resources socket room.
     */
    private pushSocketData() {
        try {
            const data: ResourcesRoomEventData = {
                resources: this.getResourceList(),
                watchers: txCore.resourceWatcher.getConfigs(),
            };
            txCore.webServer.webSocket.buffer('resources', data);
        } catch (_) {
            // webServer or room may not be ready yet during early boot; ignore
        }
    }

    public get bootStatus() {
        let elapsedSinceLast = null;
        if (this.resBootLog.length > 0) {
            const tsMs = this.resBootLog[this.resBootLog.length - 1].tsBooted;
            elapsedSinceLast = Math.floor((Date.now() - tsMs) / 1000);
        }
        return {
            current: this.resBooting,
            elapsedSinceLast,
        };
    }

    public get latestBootLog() {
        return cloneDeep(this.resBooting ? this.resBootLog : this.prevBootLog);
    }

    /**
     * Full update from the txaReportResources intercom response.
     * Rebuilds the resource map and pushes the new state to the socket room.
     */
    tmpUpdateResourceList(resources: any[]) {
        const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch (_) { return s; } };

        this.resourceMap.clear();
        let skipped = 0;
        for (const res of resources) {
            if (!res.name || !res.path) { skipped++; continue; }
            const normalizedPath = path.normalize(res.path);
            this.resourceMap.set(res.name, {
                name: res.name,
                displayName: safeDecode(String(res.name)),
                status: res.status === 'started' ? 'started' : 'stopped',
                path: res.path,
                pathMissing: !fs.existsSync(normalizedPath),
                version: res.version ? String(res.version).trim() : '',
                author: res.author ? String(res.author).trim() : '',
                description: res.description ? String(res.description).trim() : '',
            });
        }
        console.verbose.debug(`Loaded ${this.resourceMap.size} resources (${skipped} skipped).`);

        this.pushSocketData();
    }

    /**
     * Returns a snapshot of all known resources.
     */
    public getResourceList(): ResourceItem[] {
        return Array.from(this.resourceMap.values());
    }
};
