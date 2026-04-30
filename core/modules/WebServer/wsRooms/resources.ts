import type { RoomType } from '../webSocket';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
import type { ResourcesRoomEventData } from '@shared/resourcesApiTypes';


export default {
    permission: true, // all authed admins can see
    eventName: 'resources',
    cumulativeBuffer: false,
    outBuffer: null,
    initialData: (): ResourcesRoomEventData => {
        const resources = txCore.fxResources.getResourceList();

        // If the resource map is empty and the server is alive, kick off a
        // txaReportResources fetch so the client gets data shortly after joining.
        if (!resources.length && txCore.fxRunner.child?.isAlive) {
            setImmediate(() => {
                txCore.fxRunner.sendCommand('txaReportResources', [], SYM_SYSTEM_AUTHOR);
            });
        }

        return {
            resources,
            watchers: txCore.resourceWatcher.getConfigs(),
        };
    },
} satisfies RoomType;
