import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ServerIcon,
    RefreshCwIcon,
    SearchIcon,
    ChevronsDownUpIcon,
    ChevronsUpDownIcon,
    Loader2Icon,
    FilterXIcon,
    FolderXIcon,
} from 'lucide-react';
import { useAtomValue } from 'jotai';
import { fxRunnerStateAtom } from '@/hooks/status';
import { useAdminPerms } from '@/hooks/auth';
import { useBackendApi } from '@/hooks/fetch';
import { getSocket } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useSetResourcesData, useResourcesData } from './resourcesHooks';
import { groupResources, DEFAULT_RESOURCES } from './resourcesUtils';
import ResourceGroupCard from './ResourceGroupCard';
import WatcherDialog from './WatcherDialog';
import type {
    ResourceItem,
    WatcherConfig,
    WatcherConfigs,
} from '@shared/resourcesApiTypes';
import type { ApiToastResp } from '@shared/genericApiTypes';

export default function ResourcesPage() {
    const { hasPerm } = useAdminPerms();
    const fxRunnerState = useAtomValue(fxRunnerStateAtom);
    const canEdit = hasPerm('commands.resources') && fxRunnerState.isChildAlive;

    const setResourcesData = useSetResourcesData();
    const resourcesData = useResourcesData();

    const [search, setSearch] = useState('');
    const [showDefaults, setShowDefaults] = useState(false);
    const [onlyStopped, setOnlyStopped] = useState(false);
    const [allCollapsed, setAllCollapsed] = useState(false);
    const [collapseKey, setCollapseKey] = useState(0);
    const [watchDialogResource, setWatchDialogResource] = useState<{
        name: string;
        displayName: string;
    } | null>(null);
    const [missingDialogName, setMissingDialogName] = useState<string | null>(
        null,
    );

    const commandApi = useBackendApi<ApiToastResp>({
        method: 'POST',
        path: '/fxserver/commands',
    });

    useEffect(() => {
        const socket = getSocket(['resources']);
        socket.on('resources', (data) => setResourcesData(data));
        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            setResourcesData(null);
        };
    }, []);

    const groups = useMemo(() => {
        if (!resourcesData) return null;
        return groupResources(resourcesData.resources);
    }, [resourcesData]);

    const watchers: WatcherConfigs = resourcesData?.watchers ?? {};

    const handleRefresh = () => {
        commandApi({
            data: { action: 'refresh_res', parameter: '' },
            toastLoadingMessage: 'Refreshing resources...',
        });
    };

    const handleAction = (action: string, parameter: string) => {
        commandApi({
            data: { action, parameter },
            toastLoadingMessage: 'Executing...',
        });
    };

    const handleWatchDialogClose = useCallback((_saved?: WatcherConfig) => {
        setWatchDialogResource(null);
    }, []);

    const handleToggleAll = () => {
        setAllCollapsed((prev) => !prev);
        setCollapseKey((k) => k + 1);
    };

    let content: React.ReactNode;

    if (!resourcesData) {
        content = (
            <div className='flex items-center justify-center py-16 text-muted-foreground gap-2'>
                <Loader2Icon className='animate-spin size-5' />
                Connecting...
            </div>
        );
    } else if (!groups || groups.length === 0) {
        content = (
            <div className='text-center py-12 space-y-3'>
                <p className='text-muted-foreground'>
                    {fxRunnerState.isChildAlive
                        ? 'No resources found. Try refreshing.'
                        : 'The server is not running.'}
                </p>
                {fxRunnerState.isChildAlive && (
                    <Button variant='outline' size='sm' onClick={handleRefresh}>
                        Reload &amp; Refresh
                    </Button>
                )}
            </div>
        );
    } else {
        const hasVisible = groups.some((g) =>
            g.resources.some((r) => {
                if (!showDefaults && DEFAULT_RESOURCES.has(r.name))
                    return false;
                if (onlyStopped && r.status !== 'stopped') return false;
                if (
                    search &&
                    !r.displayName.toLowerCase().includes(search.toLowerCase())
                )
                    return false;
                return true;
            }),
        );

        if (!hasVisible) {
            const isFiltered = search || onlyStopped || !showDefaults;
            content = (
                <div className='flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground'>
                    <FilterXIcon className='size-8 opacity-40' />
                    <p className='text-sm'>
                        {isFiltered
                            ? 'No resources match your current filters.'
                            : 'No resources found.'}
                    </p>
                    {isFiltered && (
                        <Button
                            variant='outline'
                            size='sm'
                            onClick={() => {
                                setSearch('');
                                setOnlyStopped(false);
                                setShowDefaults(true);
                            }}
                        >
                            Clear filters
                        </Button>
                    )}
                </div>
            );
        } else {
            content = (
                <div className='space-y-2'>
                    {groups.map((g) => (
                        <ResourceGroupCard
                            key={`${g.subPath}-${collapseKey}`}
                            group={g}
                            watchers={watchers}
                            canEdit={canEdit}
                            showDefaults={showDefaults}
                            onlyStopped={onlyStopped}
                            searchQuery={search}
                            onWatchClick={(r: ResourceItem) =>
                                setWatchDialogResource({
                                    name: r.name,
                                    displayName: r.displayName,
                                })
                            }
                            onAction={handleAction}
                            onMissingClick={setMissingDialogName}
                            startCollapsed={allCollapsed}
                        />
                    ))}
                </div>
            );
        }
    }

    return (
        <div className='w-full mb-10'>
            <PageHeader icon={<ServerIcon />} title='Resources'>
                <Button
                    variant='outline'
                    size='sm'
                    className='gap-1.5'
                    onClick={handleRefresh}
                    disabled={!fxRunnerState.isChildAlive}
                >
                    <RefreshCwIcon className='size-4' />
                    Reload &amp; Refresh
                </Button>
            </PageHeader>

            <div className='px-4 space-y-3'>
                <div className='flex flex-wrap gap-x-4 gap-y-2 items-center'>
                    <div className='relative flex-1 min-w-48'>
                        <SearchIcon className='absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none' />
                        <Input
                            className='pl-8'
                            placeholder='Find resource by name...'
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                        <div className='flex items-center gap-2'>
                            <Switch
                                id='show-defaults'
                                checked={showDefaults}
                                onCheckedChange={setShowDefaults}
                            />
                            <Label
                                htmlFor='show-defaults'
                                className='cursor-pointer text-sm whitespace-nowrap'
                            >
                                Default resources
                            </Label>
                        </div>

                        <div className='flex items-center gap-2'>
                            <Switch
                                id='only-stopped'
                                checked={onlyStopped}
                                onCheckedChange={setOnlyStopped}
                            />
                            <Label
                                htmlFor='only-stopped'
                                className='cursor-pointer text-sm whitespace-nowrap'
                            >
                                Only stopped
                            </Label>
                        </div>

                        <Button
                            variant='outline'
                            size='sm'
                            className='gap-1.5'
                            onClick={handleToggleAll}
                        >
                            {allCollapsed ? (
                                <>
                                    <ChevronsUpDownIcon className='size-4' />{' '}
                                    Expand All
                                </>
                            ) : (
                                <>
                                    <ChevronsDownUpIcon className='size-4' />{' '}
                                    Collapse All
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {content}
            </div>

            <WatcherDialog
                resourceName={watchDialogResource?.name ?? null}
                displayName={watchDialogResource?.displayName ?? null}
                currentConfig={
                    watchDialogResource
                        ? (watchers[watchDialogResource.name] ?? null)
                        : null
                }
                onClose={handleWatchDialogClose}
            />

            <Dialog
                open={missingDialogName !== null}
                onOpenChange={(open) => !open && setMissingDialogName(null)}
            >
                <DialogContent className='max-w-sm'>
                    <DialogHeader>
                        <DialogTitle className='flex items-center gap-2'>
                            <FolderXIcon className='size-5 text-destructive' />
                            Directory not found
                        </DialogTitle>
                    </DialogHeader>
                    <div className='space-y-3 text-sm text-muted-foreground'>
                        <p>
                            The directory for{' '}
                            <span className='font-semibold text-foreground'>
                                {missingDialogName}
                            </span>{' '}
                            no longer exists on disk, but FXServer still has it
                            loaded in memory.
                        </p>
                        <p>
                            This usually happens when a resource folder is
                            deleted or moved while the server is running. The
                            resource will disappear from this list on the next
                            server restart.
                        </p>
                        <p>
                            You can stop it using the button on this page, but
                            you won&apos;t be able to start it again until the
                            folder is restored.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
