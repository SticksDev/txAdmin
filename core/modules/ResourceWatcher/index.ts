const modulename = 'ResourceWatcher';
import fsp from 'node:fs/promises';
import path from 'node:path';
import chokidar, { FSWatcher } from 'chokidar';
import picomatch from 'picomatch';
import consoleFactory from '@lib/console';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
import { txEnv } from '@core/globalData';
import type { WatcherConfig, WatcherConfigs } from '@shared/resourcesApiTypes';
const console = consoleFactory(modulename);

// Re-export for route handlers
export type { WatcherConfig, WatcherConfigs };

const CONFIG_FILE = 'resourceWatchers.json';
const STALE_DISABLED_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Module responsible for watching resource directories and restarting resources
 * when their files change on disk.
 */
export default class ResourceWatcher {
    static readonly configKeysWatched = [
        'resourceWatcher.restartDebounceMs',
        'resourceWatcher.maxRestartsPerResource',
        'resourceWatcher.maxRestartsWindowSecs',
    ];

    private readonly configFilePath: string;
    private watcherConfigs: WatcherConfigs = {};
    private resourcePaths = new Map<string, string>(); // resource name -> fs path
    private activeWatchers = new Map<string, FSWatcher>();
    private restartTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private serverIsAlive = false;

    // Circuit breaker: track timestamps of recent restarts per resource
    private restartHistory = new Map<string, number[]>();
    // Tripped watchers: resources that have been stopped due to too many restarts
    private trippedWatchers = new Set<string>();

    constructor() {
        this.configFilePath = path.join(txEnv.profilePath, 'data', CONFIG_FILE);
        this.loadConfig();
    }

    /**
     * Called by ConfigStore when one of our watched config keys changes.
     * Restart all watchers so the new debounce value is picked up.
     */
    public handleConfigUpdate() {
        if (this.serverIsAlive) {
            this.restartWatchers();
        }
    }

    private async loadConfig() {
        try {
            const raw = await fsp.readFile(this.configFilePath, 'utf-8');
            this.watcherConfigs = JSON.parse(raw);

            // Backfill disabledAt for disabled configs that predate this field
            // so the 7-day stale clock starts from first boot with this code
            let backfilled = false;
            for (const cfg of Object.values(this.watcherConfigs)) {
                if (!cfg.enabled && cfg.disabledAt === undefined) {
                    cfg.disabledAt = Date.now();
                    backfilled = true;
                }
            }
            if (backfilled) await this.saveConfig();

            console.verbose.debug(
                `Loaded ${Object.keys(this.watcherConfigs).length} watcher config(s).`,
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.warn(
                    `Failed to load watcher config: ${(error as Error).message}`,
                );
            }
            this.watcherConfigs = {};
        }
        await this.pruneStaleConfigs();
    }

    /**
     * Removes watcher configs that have been disabled for longer than STALE_DISABLED_MS.
     * Only called once at boot.
     */
    private async pruneStaleConfigs() {
        const now = Date.now();
        const stale = Object.entries(this.watcherConfigs).filter(
            ([, cfg]) => !cfg.enabled && cfg.disabledAt !== undefined && now - cfg.disabledAt >= STALE_DISABLED_MS,
        );
        if (!stale.length) return;

        for (const [name] of stale) {
            delete this.watcherConfigs[name];
            console.log(`[ResourceWatcher] Removed stale config for "${name}" (disabled for 7+ days).`);
        }
        await this.saveConfig();
    }

    private async saveConfig() {
        try {
            await fsp.writeFile(
                this.configFilePath,
                JSON.stringify(this.watcherConfigs, null, 2),
            );
        } catch (error) {
            console.error(
                `Failed to save watcher config: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Called when the FXServer process closes.
     * Stops all active watchers until the server comes back.
     */
    public handleServerClose() {
        this.serverIsAlive = false;
        this.stopAllWatchers();
        this.restartHistory.clear();
        this.trippedWatchers.clear();
    }

    /**
     * Called when the resource list is refreshed from the intercom.
     * Stores the resource paths and (re)starts watchers for enabled resources.
     */
    public updateResourcePaths(
        resources: Array<{ name: string; path: string; status?: string }>,
    ) {
        this.serverIsAlive = true;
        this.resourcePaths.clear();
        for (const res of resources) {
            if (res.name && res.path) {
                this.resourcePaths.set(res.name, res.path);
            }
        }
        this.restartWatchers();
    }

    private stopAllWatchers() {
        for (const watcher of this.activeWatchers.values()) {
            watcher.close().catch(() => {});
        }
        this.activeWatchers.clear();
        for (const timer of this.restartTimers.values()) {
            clearTimeout(timer);
        }
        this.restartTimers.clear();
    }

    private restartWatchers() {
        this.stopAllWatchers();
        // Don't clear trippedWatchers here, the circuit stays tripped until server restart
        for (const [name, cfg] of Object.entries(this.watcherConfigs)) {
            if (!cfg.enabled) continue;
            if (this.trippedWatchers.has(name)) continue;
            const resPath = this.resourcePaths.get(name);
            if (resPath) {
                this.startWatcher(name, resPath, cfg);
            }
        }
    }

    private startWatcher(
        resourceName: string,
        resPath: string,
        cfg: WatcherConfig,
    ) {
        // Normalize path: collapse double-slashes from GetResourcePath() and resolve separators
        resPath = path.normalize(resPath);

        const buildIgnored = () => {
            const alwaysIgnored = (p: string) =>
                /[/\\]\./.test(p) || p.includes('node_modules');
            if (cfg.filterMode === 'exclude' && cfg.patterns.length > 0) {
                const isMatch = picomatch(cfg.patterns);
                return (filePath: string) => {
                    if (alwaysIgnored(filePath)) return true;
                    const rel = path
                        .relative(resPath, filePath)
                        .replace(/\\/g, '/');
                    return isMatch(rel);
                };
            }
            return alwaysIgnored;
        };

        const debounceMs = txConfig.resourceWatcher.restartDebounceMs;
        const watcher = chokidar.watch(resPath, {
            ignored: buildIgnored(),
            ignoreInitial: true,
            persistent: true,
            disableGlobbing: true,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100,
            },
        });

        const handleChange = (filePath: string) => {
            if (!this.serverIsAlive) return;

            // For include mode: only trigger if the file matches a pattern
            if (cfg.filterMode === 'include' && cfg.patterns.length > 0) {
                const rel = path
                    .relative(resPath, filePath)
                    .replace(/\\/g, '/');
                const isMatch = picomatch(cfg.patterns);
                if (!isMatch(rel)) return;
            }

            // Debounce: cancel any pending restart for this resource
            const existing = this.restartTimers.get(resourceName);
            if (existing) clearTimeout(existing);

            const timer = setTimeout(() => {
                this.restartTimers.delete(resourceName);

                // Circuit breaker check
                if (this.checkAndTripBreaker(resourceName)) return;

                const rel = path
                    .relative(resPath, filePath)
                    .replace(/\\/g, '/');
                const restartMsg = `[ResourceWatcher] Restarting "${resourceName}" (file changed: ${rel})`;
                console.log(restartMsg);
                txCore.logger.fxserver.logInformational(restartMsg);
                txCore.fxRunner.sendCommand(
                    'ensure',
                    [resourceName],
                    SYM_SYSTEM_AUTHOR,
                );
            }, debounceMs);

            this.restartTimers.set(resourceName, timer);
        };

        watcher.on('add', handleChange);
        watcher.on('change', handleChange);
        watcher.on('unlink', handleChange);
        watcher.on('error', (err) => {
            console.warn(`Watcher error for "${resourceName}": ${err.message}`);
        });

        this.activeWatchers.set(resourceName, watcher);
        console.verbose.log(`Watching "${resourceName}" at "${resPath}"`);
    }

    /**
     * Tracks restart timestamps for a resource and trips the circuit breaker
     * if too many restarts have occurred in the configured window.
     * Returns true if the breaker was tripped (caller should abort the restart).
     */
    private checkAndTripBreaker(resourceName: string): boolean {
        const maxRestarts = txConfig.resourceWatcher.maxRestartsPerResource;
        const windowSecs = txConfig.resourceWatcher.maxRestartsWindowSecs;
        const windowMs = windowSecs * 1000;
        const now = Date.now();

        // Prune old timestamps outside the window
        const history = (this.restartHistory.get(resourceName) ?? []).filter(
            (ts) => now - ts < windowMs,
        );
        history.push(now);
        this.restartHistory.set(resourceName, history);

        if (history.length >= maxRestarts) {
            // Trip the breaker
            this.trippedWatchers.add(resourceName);

            // Stop the watcher
            const watcher = this.activeWatchers.get(resourceName);
            if (watcher) {
                watcher.close().catch(() => {});
                this.activeWatchers.delete(resourceName);
            }

            // Persist enabled=false so the watcher stays off across server restarts
            if (this.watcherConfigs[resourceName]) {
                this.watcherConfigs[resourceName].enabled = false;
                this.watcherConfigs[resourceName].disabledAt = Date.now();
                this.saveConfig().catch(() => {});
            }

            const msg =
                `[ResourceWatcher] File watcher for "${resourceName}" has been disabled after ` +
                `${history.length} restarts within ${windowSecs}s. ` +
                `Re-enable it in the txAdmin panel > Resources once the issue is fixed.`;
            console.warn(msg);
            txCore.logger.fxserver.logWarning(msg);
            return true;
        }

        return false;
    }

    public getConfigs(): WatcherConfigs {
        return { ...this.watcherConfigs };
    }

    public getConfig(resourceName: string): WatcherConfig | null {
        return this.watcherConfigs[resourceName] ?? null;
    }

    public isWatching(resourceName: string): boolean {
        return this.activeWatchers.has(resourceName);
    }

    public isTripped(resourceName: string): boolean {
        return this.trippedWatchers.has(resourceName);
    }

    public async setConfig(
        resourceName: string,
        cfg: WatcherConfig,
    ): Promise<void> {
        // Track when the watcher was disabled so stale cleanup knows how long it's been off
        if (!cfg.enabled) {
            // Preserve existing timestamp if already disabled; otherwise stamp now
            cfg.disabledAt = this.watcherConfigs[resourceName]?.disabledAt ?? Date.now();
        } else {
            delete cfg.disabledAt;
        }
        this.watcherConfigs[resourceName] = cfg;
        await this.saveConfig();

        // Re-enabling a resource clears its tripped state
        if (cfg.enabled) {
            this.trippedWatchers.delete(resourceName);
            this.restartHistory.delete(resourceName);
        }

        // Tear down existing watcher for this resource
        const existing = this.activeWatchers.get(resourceName);
        if (existing) {
            await existing.close();
            this.activeWatchers.delete(resourceName);
        }
        const pendingTimer = this.restartTimers.get(resourceName);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.restartTimers.delete(resourceName);
        }

        // Start new watcher if enabled and path is known
        if (cfg.enabled && this.serverIsAlive) {
            const resPath = this.resourcePaths.get(resourceName);
            if (resPath) {
                this.startWatcher(resourceName, resPath, cfg);
            }
        }
    }

    public async deleteConfig(resourceName: string): Promise<void> {
        delete this.watcherConfigs[resourceName];
        this.trippedWatchers.delete(resourceName);
        this.restartHistory.delete(resourceName);
        await this.saveConfig();

        const existing = this.activeWatchers.get(resourceName);
        if (existing) {
            await existing.close();
            this.activeWatchers.delete(resourceName);
        }
    }
}
