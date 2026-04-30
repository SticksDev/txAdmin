const modulename = 'WebServer:ResourcesList';
import fs from 'node:fs';
import path from 'node:path';
import slash from 'slash';
import consoleFactory from '@lib/console';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import type { ResourceItem, WatcherConfigs } from '@shared/resourcesApiTypes';
const console = consoleFactory(modulename);

type ResourceGroup = { subPath: string; resources: ResourceItem[] };
type ResourceListResp = { groups: ResourceGroup[]; watchers: WatcherConfigs } | { error: string };

const isUndefined = (x: any) => x === undefined;
const breakPath = (inPath: string) => slash(path.normalize(inPath)).split('/').filter(Boolean);

function getResourceSubPath(resPath: string): string {
    if (resPath.includes('system_resources')) return 'system_resources';
    if (!path.isAbsolute(resPath)) return resPath;

    let serverDataPathArr = breakPath(`${txConfig.server.dataPath}/resources`);
    let resPathArr = breakPath(resPath);
    for (let i = 0; i < serverDataPathArr.length; i++) {
        if (isUndefined(resPathArr[i])) break;
        if (serverDataPathArr[i].toLowerCase() === resPathArr[i].toLowerCase()) {
            delete (resPathArr as any)[i];
        }
    }
    resPathArr.pop();
    resPathArr = resPathArr.filter(Boolean);
    return resPathArr.length ? resPathArr.join('/') : 'root';
}

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch (_) { return s; } };

function processResources(resList: any[]): ResourceGroup[] {
    const grouped: Record<string, ResourceItem[]> = {};

    for (const resource of resList) {
        if (isUndefined(resource.name) || isUndefined(resource.status) || isUndefined(resource.path) || resource.path === '') {
            continue;
        }
        const subPath = getResourceSubPath(resource.path);
        const normalizedPath = path.normalize(resource.path);
        const item: ResourceItem = {
            name: resource.name,
            displayName: safeDecode(String(resource.name)),
            status: resource.status,
            path: resource.path,
            pathMissing: !fs.existsSync(normalizedPath),
            version: resource.version ? resource.version.trim() : '',
            author: resource.author ? resource.author.trim() : '',
            description: resource.description ? resource.description.trim() : '',
        };
        if (grouped[subPath]) {
            grouped[subPath].push(item);
        } else {
            grouped[subPath] = [item];
        }
    }

    return Object.entries(grouped)
        .map(([subPath, resources]) => ({
            subPath,
            resources: resources.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.subPath.localeCompare(b.subPath));
}


/**
 * GET /resources/list
 * Returns the resource list + watcher configs as JSON.
 */
export default async function ResourcesList(ctx: AuthedCtx) {
    if (!txCore.fxRunner.child?.isAlive) {
        return ctx.send<ResourceListResp>({ error: 'The server is not running.' });
    }

    // Record timestamp before sending so we only accept reports that arrived after this command
    const cmdSentAt = Date.now();
    const cmdSuccess = txCore.fxRunner.sendCommand('txaReportResources', [], SYM_SYSTEM_AUTHOR);
    if (!cmdSuccess) {
        return ctx.send<ResourceListResp>({ error: 'Failed to request resource list from FXServer.' });
    }

    // Poll for a resource report that arrived after we sent the command (up to 3 seconds)
    const result = await new Promise<ResourceListResp>((resolve) => {
        const interval = setInterval(() => {
            const report = txCore.fxResources.resourceReport;
            if (report && report.ts.getTime() >= cmdSentAt && Array.isArray(report.resources)) {
                clearInterval(interval);
                clearTimeout(timeout);
                const groups = processResources(report.resources);
                const watchers = txCore.resourceWatcher.getConfigs();
                resolve({ groups, watchers });
            }
        }, 100);

        const timeout = setTimeout(() => {
            clearInterval(interval);
            resolve({ error: 'Timed out waiting for resource list. Make sure the server is running and responding.' });
        }, 3000);
    });

    return ctx.send<ResourceListResp>(result);
}
