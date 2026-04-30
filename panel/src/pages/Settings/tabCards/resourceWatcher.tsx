import { Input } from "@/components/ui/input";
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { useState, useEffect, useRef, useMemo, useReducer } from "react";
import { getConfigEmptyState, getConfigAccessors, SettingsCardProps, getPageConfig, configsReducer, getConfigDiff } from "../utils";
import SettingsCardShell from "../SettingsCardShell";


export const pageConfigs = {
    restartDebounceMs: getPageConfig('resourceWatcher', 'restartDebounceMs'),
    maxRestartsPerResource: getPageConfig('resourceWatcher', 'maxRestartsPerResource'),
    maxRestartsWindowSecs: getPageConfig('resourceWatcher', 'maxRestartsWindowSecs'),
} as const;

export default function ConfigCardResourceWatcher({ cardCtx, pageCtx }: SettingsCardProps) {
    const [states, dispatch] = useReducer(
        configsReducer<typeof pageConfigs>,
        null,
        () => getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    const debounceRef = useRef<HTMLInputElement | null>(null);
    const maxRestartsRef = useRef<HTMLInputElement | null>(null);
    const windowSecsRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        updatePageState();
    }, [states]);

    const updatePageState = () => {
        const overwrites = {
            restartDebounceMs: debounceRef.current?.value !== undefined
                ? parseInt(debounceRef.current.value) || undefined
                : undefined,
            maxRestartsPerResource: maxRestartsRef.current?.value !== undefined
                ? parseInt(maxRestartsRef.current.value) || undefined
                : undefined,
            maxRestartsWindowSecs: windowSecsRef.current?.value !== undefined
                ? parseInt(windowSecsRef.current.value) || undefined
                : undefined,
        };
        const res = getConfigDiff(cfg, states, overwrites, false);
        pageCtx.setCardPendingSave(res.hasChanges ? cardCtx : null);
        return res;
    };

    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;
        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    return (
        <SettingsCardShell
            cardCtx={cardCtx}
            pageCtx={pageCtx}
            onClickSave={handleOnSave}
        >
            <SettingItem label="Restart Debounce" htmlFor={cfg.restartDebounceMs.eid}>
                <Input
                    id={cfg.restartDebounceMs.eid}
                    ref={debounceRef}
                    type="number"
                    min={100}
                    max={10000}
                    defaultValue={cfg.restartDebounceMs.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    How long to wait (in milliseconds) after the last file change before restarting the resource.
                    Increase this if you use an editor that writes files in multiple quick steps. <strong>Default: 700ms.</strong>
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label="Max Restarts Per Resource" htmlFor={cfg.maxRestartsPerResource.eid}>
                <Input
                    id={cfg.maxRestartsPerResource.eid}
                    ref={maxRestartsRef}
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={cfg.maxRestartsPerResource.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    Maximum number of automatic restarts allowed per resource within the time window below.
                    If exceeded, the watcher for that resource is disabled and a warning is printed to the console. <strong>Default: 5.</strong>
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label="Restart Window" htmlFor={cfg.maxRestartsWindowSecs.eid}>
                <Input
                    id={cfg.maxRestartsWindowSecs.eid}
                    ref={windowSecsRef}
                    type="number"
                    min={10}
                    max={3600}
                    defaultValue={cfg.maxRestartsWindowSecs.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    The rolling time window (in seconds) used to count restarts against the limit above.
                    Restarts older than this are ignored. <strong>Default: 60 seconds.</strong>
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
