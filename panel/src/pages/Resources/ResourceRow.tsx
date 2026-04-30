import { EyeIcon, EyeOffIcon, FolderXIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ResourceItem, WatcherConfig } from '@shared/resourcesApiTypes';

type ResourceRowProps = {
    resource: ResourceItem;
    watcherConfig: WatcherConfig | undefined;
    canEdit: boolean;
    onWatchClick: (resource: ResourceItem) => void;
    onAction: (action: string, name: string) => void;
    onMissingClick: (displayName: string) => void;
};

export default function ResourceRow({
    resource,
    watcherConfig,
    canEdit,
    onWatchClick,
    onAction,
    onMissingClick,
}: ResourceRowProps) {
    const isWatched = watcherConfig?.enabled === true;

    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-2 px-3 py-2 border-t first:border-t-0 hover:bg-muted/30 transition-colors',
                resource.pathMissing && 'opacity-60',
            )}
        >
            <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-1.5'>
                    <span className='font-semibold text-sm'>
                        {resource.displayName}
                    </span>
                    {resource.pathMissing && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className='text-destructive shrink-0 cursor-pointer'
                                    onClick={() =>
                                        onMissingClick(resource.displayName)
                                    }
                                >
                                    <FolderXIcon className='size-3.5' />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                Directory not found on disk. Click to learn more
                            </TooltipContent>
                        </Tooltip>
                    )}
                    {!resource.pathMissing && resource.version && (
                        <span className='text-xs text-muted-foreground italic'>
                            {resource.version}
                        </span>
                    )}
                    {!resource.pathMissing && resource.author && (
                        <span className='text-xs text-muted-foreground'>
                            by {resource.author}
                        </span>
                    )}
                </div>
                {!resource.pathMissing && resource.description && (
                    <p className='text-xs text-muted-foreground mt-0.5 truncate'>
                        {resource.description}
                    </p>
                )}
            </div>

            <div className='flex items-center gap-1.5 shrink-0'>
                <Button
                    variant='outline'
                    size='sm'
                    className={cn(
                        'h-7 gap-1.5 px-2',
                        isWatched && 'border-info text-info hover:bg-info/10',
                    )}
                    onClick={() => onWatchClick(resource)}
                    disabled={!canEdit}
                    title={
                        isWatched
                            ? 'Watching for file changes — click to configure'
                            : 'Click to set up file watching'
                    }
                >
                    {isWatched ? (
                        <EyeIcon className='size-3.5' />
                    ) : (
                        <EyeOffIcon className='size-3.5' />
                    )}
                    <span className='hidden sm:inline text-xs'>Watch</span>
                </Button>

                {resource.status === 'started' ? (
                    <>
                        <Button
                            variant='outline'
                            size='sm'
                            className='h-7 px-2 text-xs border-warning text-warning hover:bg-warning hover:text-warning-foreground'
                            onClick={() =>
                                onAction('ensure_res', resource.name)
                            }
                            disabled={!canEdit}
                        >
                            Restart
                        </Button>
                        <Button
                            variant='outline'
                            size='sm'
                            className='h-7 px-2 text-xs border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground'
                            onClick={() => onAction('stop_res', resource.name)}
                            disabled={!canEdit}
                        >
                            Stop
                        </Button>
                    </>
                ) : (
                    <Button
                        variant='outline'
                        size='sm'
                        className='h-7 px-2 text-xs border-success text-success hover:bg-success hover:text-success-foreground'
                        onClick={() => onAction('ensure_res', resource.name)}
                        disabled={!canEdit}
                    >
                        Start
                    </Button>
                )}
            </div>
        </div>
    );
}
