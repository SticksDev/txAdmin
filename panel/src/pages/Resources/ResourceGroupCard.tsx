import { useMemo, useState } from 'react';
import { EyeIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import ResourceRow from './ResourceRow';
import { DEFAULT_RESOURCES, type ResourceGroup } from './resourcesUtils';
import type { ResourceItem, WatcherConfigs } from '@shared/resourcesApiTypes';

type ResourceGroupCardProps = {
    group: ResourceGroup;
    watchers: WatcherConfigs;
    canEdit: boolean;
    showDefaults: boolean;
    onlyStopped: boolean;
    searchQuery: string;
    onWatchClick: (resource: ResourceItem) => void;
    onAction: (action: string, name: string) => void;
    onMissingClick: (displayName: string) => void;
    startCollapsed: boolean;
};

export default function ResourceGroupCard({
    group,
    watchers,
    canEdit,
    showDefaults,
    onlyStopped,
    searchQuery,
    onWatchClick,
    onAction,
    onMissingClick,
    startCollapsed,
}: ResourceGroupCardProps) {
    const [collapsed, setCollapsed] = useState(startCollapsed);

    const visibleResources = useMemo(() => {
        return group.resources.filter((r) => {
            if (!showDefaults && DEFAULT_RESOURCES.has(r.name)) return false;
            if (onlyStopped && r.status !== 'stopped') return false;
            if (searchQuery && !r.displayName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [group.resources, showDefaults, onlyStopped, searchQuery]);

    if (visibleResources.length === 0) return null;

    const watchedCount = visibleResources.filter((r) => watchers[r.displayName]?.enabled).length;

    return (
        <div className='border rounded-lg overflow-hidden'>
            <button
                className='w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/70 transition-colors text-left'
                onClick={() => setCollapsed((c) => !c)}
            >
                <span className='font-semibold text-sm'>{group.subPath}</span>
                <div className='flex items-center gap-3 text-muted-foreground'>
                    {watchedCount > 0 && (
                        <span className='flex items-center gap-1 text-xs text-info'>
                            <EyeIcon className='size-3' />
                            {watchedCount}
                        </span>
                    )}
                    <span className='text-xs'>{visibleResources.length}</span>
                    {collapsed ? (
                        <ChevronRightIcon className='size-4' />
                    ) : (
                        <ChevronDownIcon className='size-4' />
                    )}
                </div>
            </button>

            {!collapsed && (
                <div>
                    {visibleResources.map((r) => (
                        <ResourceRow
                            key={r.name}
                            resource={r}
                            watcherConfig={watchers[r.displayName]}
                            canEdit={canEdit}
                            onWatchClick={onWatchClick}
                            onAction={onAction}
                            onMissingClick={onMissingClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
