const modulename = 'WebServer:ResourceWatcherActions';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { ApiToastResp } from '@shared/genericApiTypes';
import type { WatcherConfig, WatcherFilterMode } from '@shared/resourcesApiTypes';
const console = consoleFactory(modulename);
const VALID_FILTER_MODES: WatcherFilterMode[] = ['all', 'include', 'exclude'];


/**
 * GET /resources/watchers
 * Returns all saved watcher configs.
 */
export async function getWatchers(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('commands.resources', modulename)) {
        return ctx.send<ApiToastResp>({ type: 'error', msg: 'Permission denied.' });
    }
    const configs = txCore.resourceWatcher.getConfigs();
    return ctx.send({ configs });
}


/**
 * POST /resources/watchers/:resourceName
 * Saves or updates the watcher config for a single resource.
 * Body: { enabled, filterMode, patterns }
 */
export async function setWatcher(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('commands.resources', modulename)) {
        return ctx.send<ApiToastResp>({ type: 'error', msg: 'Permission denied.' });
    }

    const resourceName = (ctx.params as any).resourceName as string;
    if (!resourceName) {
        return ctx.send<ApiToastResp>({ type: 'error', msg: 'Missing resource name.' });
    }

    const body = ctx.request.body as any;
    const enabled = Boolean(body.enabled);
    const filterMode: WatcherFilterMode = VALID_FILTER_MODES.includes(body.filterMode)
        ? body.filterMode
        : 'all';
    const patterns: string[] = Array.isArray(body.patterns)
        ? body.patterns.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
        : [];

    const cfg: WatcherConfig = { enabled, filterMode, patterns };

    try {
        const prevConfig = txCore.resourceWatcher.getConfig(resourceName);
        await txCore.resourceWatcher.setConfig(resourceName, cfg);
        ctx.admin.logAction(`Set watcher for "${resourceName}": enabled=${enabled}, filterMode=${filterMode}`);
        // Push updated watcher state to all clients in the resources room
        txCore.webServer.webSocket.pushRefresh('resources');

        let msg: string;
        if (prevConfig === null || prevConfig.enabled !== enabled) {
            msg = `Watcher ${enabled ? 'enabled' : 'disabled'} for "${resourceName}".`;
        } else {
            msg = `Watcher updated for "${resourceName}".`;
        }
        return ctx.send<ApiToastResp>({ type: 'success', msg });
    } catch (error) {
        console.error(`Failed to set watcher for "${resourceName}":`, error);
        return ctx.send<ApiToastResp>({ type: 'error', msg: 'Internal error saving watcher config.' });
    }
}
