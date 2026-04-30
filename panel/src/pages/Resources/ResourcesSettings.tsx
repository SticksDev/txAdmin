import { useState } from 'react';
import useSWR from 'swr';
import { EyeIcon, EyeOffIcon, ChevronDownIcon, ChevronRightIcon, InfoIcon } from 'lucide-react';
import { useBackendApi, ApiTimeout } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { txToast } from '@/components/TxToaster';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ConfigCardResourceWatcher from '@/pages/Settings/tabCards/resourceWatcher';
import { SYM_RESET_CONFIG, type SettingsCardContext, type SettingsPageContext } from '@/pages/Settings/utils';
import type { GetConfigsResp, PartialTxConfigs, SaveConfigsReq, SaveConfigsResp } from '@shared/otherTypes';
import type { WatcherConfigs } from '@shared/resourcesApiTypes';

const CARD_CTX: SettingsCardContext = {
    tabId: 'resource-watcher',
    tabName: 'Resource Watcher',
    cardId: 'resource-watcher',
    cardName: 'Resource Watcher',
    cardTitle: 'Resource Watcher',
};

type ResourcesSettingsProps = {
    watchers: WatcherConfigs;
};

export default function ResourcesSettings({ watchers }: ResourcesSettingsProps) {
    const { hasPerm } = useAdminPerms();
    const [cardPendingSave, setCardPendingSave] = useState<SettingsCardContext | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const queryApi = useBackendApi<GetConfigsResp>({
        method: 'GET',
        path: '/settings/configs',
        throwGenericErrors: true,
    });
    const saveApi = useBackendApi<SaveConfigsResp, SaveConfigsReq>({
        method: 'POST',
        path: '/settings/configs/:card',
        throwGenericErrors: true,
    });

    const swr = useSWR('/settings/configs', async () => {
        const data = await queryApi({});
        if (!data) throw new Error('No data returned');
        return data;
    }, { revalidateOnMount: true, revalidateOnFocus: false });

    const saveChanges = async (source: SettingsCardContext, changes: PartialTxConfigs) => {
        if (isSaving) return;
        const toastId = txToast.loading(`Saving ${source.cardTitle} settings...`, { id: 'settingsSave' });
        setIsSaving(true);
        try {
            if (!swr.data) throw new Error('Cannot save without data.');
            const resetKeys: string[] = [];
            for (const [scopeName, scopeData] of Object.entries(changes)) {
                for (const [configKey, configValue] of Object.entries(scopeData)) {
                    if (configValue === SYM_RESET_CONFIG) resetKeys.push(`${scopeName}.${configKey}`);
                }
            }
            const saveResp = await saveApi({
                pathParams: { card: source.cardId },
                data: { resetKeys, changes },
                timeout: ApiTimeout.LONG,
                toastId,
            });
            if (!saveResp) throw new Error('empty_response');
            if (saveResp.type === 'error') return;
            if (!saveResp.stored) throw new Error('no_stored_data');
            if (!saveResp.changelog) throw new Error('no_changelog_data');
            swr.mutate({ ...swr.data, storedConfigs: saveResp.stored, changelog: saveResp.changelog }, false);
            setCardPendingSave(null);
        } catch (error) {
            txToast.error({
                title: `Error saving ${source.cardTitle} settings:`,
                msg: (error as any).message,
            }, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const pageCtx: SettingsPageContext = {
        apiData: swr.data,
        isReadOnly: swr.isLoading || isSaving || !swr.data || !hasPerm('settings.write'),
        isLoading: swr.isLoading,
        isSaving,
        swrError: swr.error ? swr.error.message : undefined,
        cardPendingSave,
        setCardPendingSave,
        saveChanges,
    };

    // Watcher diagnostics derived from socket data
    const watcherEntries = Object.entries(watchers);
    const enabledCount = watcherEntries.filter(([, c]) => c.enabled).length;

    return (
        <div className='space-y-6 px-4 pb-10 animate-in fade-in slide-in-from-right-4 duration-200'>
            {/* Watcher config */}
            <ConfigCardResourceWatcher cardCtx={CARD_CTX} pageCtx={pageCtx} />

            {/* Watcher diagnostics */}
            <Card>
                <CardHeader className='pb-3'>
                    <CardTitle className='text-base flex items-center gap-2'>
                        <EyeIcon className='size-4' />
                        Configured Watchers
                        {watcherEntries.length > 0 && (
                            <Badge variant='secondary' className='ml-1'>
                                {enabledCount} / {watcherEntries.length} enabled
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {watcherEntries.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>
                            No watchers configured. Open any resource and click the Watch button to set one up.
                        </p>
                    ) : (
                        <>
                            <div className='divide-y rounded-md border overflow-hidden'>
                                {watcherEntries.map(([name, cfg]) => (
                                    <WatcherDiagRow key={name} name={name} cfg={cfg} />
                                ))}
                            </div>
                            <p className='flex items-start gap-1.5 mt-3 text-xs text-muted-foreground'>
                                <InfoIcon className='size-3.5 shrink-0 mt-0.5' />
                                Click a row to expand and see its patterns. Disabled watchers are automatically removed after 7 days.
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}


type WatcherDiagRowProps = {
    name: string;
    cfg: WatcherConfigs[string];
};

function WatcherDiagRow({ name, cfg }: WatcherDiagRowProps) {
    const [expanded, setExpanded] = useState(false);
    const hasPatterns = cfg.patterns.length > 0;
    const canExpand = cfg.filterMode !== 'all' && hasPatterns;

    return (
        <div className={cn(!cfg.enabled && 'opacity-60')}>
            <button
                className={cn(
                    'w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm text-left transition-colors',
                    canExpand ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default',
                )}
                onClick={() => canExpand && setExpanded((v) => !v)}
            >
                <div className='flex items-center gap-2 min-w-0 flex-1'>
                    {canExpand ? (
                        expanded
                            ? <ChevronDownIcon className='size-3.5 text-muted-foreground shrink-0' />
                            : <ChevronRightIcon className='size-3.5 text-muted-foreground shrink-0' />
                    ) : (
                        <span className='size-3.5 shrink-0' />
                    )}
                    {cfg.enabled
                        ? <EyeIcon className='size-3.5 text-info shrink-0' />
                        : <EyeOffIcon className='size-3.5 text-muted-foreground shrink-0' />
                    }
                    <span className='font-mono text-xs font-medium truncate'>{name}</span>
                </div>

                <div className='flex items-center gap-2 shrink-0 flex-wrap'>
                    {cfg.enabled ? (
                        <Badge variant='outline' className='text-xs border-info text-info'>
                            {cfg.filterMode === 'all' ? 'all files' : `${cfg.filterMode}: ${cfg.patterns.length} pattern${cfg.patterns.length !== 1 ? 's' : ''}`}
                        </Badge>
                    ) : (
                        <>
                            <span className='text-xs text-muted-foreground'>disabled</span>
                            {cfg.disabledAt && (
                                <span className='text-xs text-muted-foreground'>
                                    since {new Date(cfg.disabledAt).toLocaleDateString()}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </button>

            {expanded && (
                <div className='px-10 pb-2.5 flex flex-wrap gap-1.5'>
                    {cfg.patterns.map((p) => (
                        <code key={p} className='text-xs bg-muted px-1.5 py-0.5 rounded'>
                            {p}
                        </code>
                    ))}
                </div>
            )}
        </div>
    );
}
