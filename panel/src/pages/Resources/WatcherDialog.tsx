import { useEffect, useMemo, useState } from 'react';
import picomatch from 'picomatch';
import { EyeIcon, InfoIcon, CheckIcon, XIcon, TriangleAlertIcon } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBackendApi } from '@/hooks/fetch';
import type { WatcherConfig, WatcherFilterMode } from '@shared/resourcesApiTypes';
import type { ApiToastResp } from '@shared/genericApiTypes';


type WatcherDialogProps = {
    resourceName: string | null;
    displayName: string | null;
    currentConfig: WatcherConfig | null;
    onClose: (saved?: WatcherConfig) => void;
};

const DEFAULT_CONFIG: WatcherConfig = {
    enabled: false,
    filterMode: 'all',
    patterns: [],
};

const PREVIEW_PATHS = [
    'server.lua',
    'client.lua',
    'modules/server.lua',
    'modules/core/init.lua',
    'config/settings.json',
    'data/players.json',
    'html/ui.html',
];

const PATTERN_EXAMPLES = [
    { pattern: '*.lua', desc: 'All .lua files in the root' },
    { pattern: '**/*.lua', desc: 'All .lua files anywhere' },
    { pattern: 'config/', desc: 'Everything inside config/' },
    { pattern: 'data/*.json', desc: 'JSON files directly in data/' },
    { pattern: '**/*.{lua,json}', desc: 'All .lua and .json files' },
];

type PreviewRow = { path: string; triggers: boolean };

function PatternPreview({ filterMode, patterns }: { filterMode: WatcherFilterMode; patterns: string[] }) {
    const rows = useMemo<PreviewRow[]>(() => {
        if (filterMode === 'all') {
            return PREVIEW_PATHS.map((p) => ({ path: p, triggers: true }));
        }
        if (patterns.length === 0) {
            // include + no patterns → nothing triggers; exclude + no patterns → everything triggers
            return PREVIEW_PATHS.map((p) => ({ path: p, triggers: filterMode === 'exclude' }));
        }
        const isMatch = picomatch(patterns);
        return PREVIEW_PATHS.map((p) => ({
            path: p,
            triggers: filterMode === 'include' ? isMatch(p) : !isMatch(p),
        }));
    }, [filterMode, patterns]);

    const anyTriggers = rows.some((r) => r.triggers);

    return (
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1">
            <div className="flex items-baseline justify-between pb-0.5">
                <p className="text-xs font-medium text-muted-foreground">Pattern preview</p>
                <p className="text-xs text-muted-foreground/60 italic">example paths, not your actual files</p>
            </div>
            {rows.map(({ path, triggers }) => (
                <div key={path} className="flex items-center gap-2 text-xs font-mono">
                    {triggers ? (
                        <CheckIcon className="size-3 text-success shrink-0" />
                    ) : (
                        <XIcon className="size-3 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={triggers ? 'text-foreground' : 'text-muted-foreground/50'}>
                        {path}
                    </span>
                </div>
            ))}
            {!anyTriggers && filterMode === 'include' && patterns.length > 0 && (
                <p className="text-xs text-warning pt-1">No sample files match :( Double-check your patterns.</p>
            )}
            <p className="text-xs text-muted-foreground/60 pt-1">
                Dotfiles, <code>.git/</code>, and <code>node_modules/</code> are always excluded.
            </p>
        </div>
    );
}

export default function WatcherDialog({ resourceName, displayName, currentConfig, onClose }: WatcherDialogProps) {
    const isOpen = resourceName !== null;

    const [enabled, setEnabled] = useState(true);
    const [filterMode, setFilterMode] = useState<WatcherFilterMode>('all');
    const [patternsText, setPatternsText] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Reset form whenever dialog opens for a new resource
    useEffect(() => {
        if (!isOpen) return;
        const cfg = currentConfig ?? DEFAULT_CONFIG;
        setEnabled(cfg.enabled);
        setFilterMode(cfg.filterMode);
        setPatternsText(cfg.patterns.join('\n'));
    }, [isOpen, resourceName]);

    const setWatcherApi = useBackendApi<ApiToastResp, WatcherConfig>({
        method: 'POST',
        path: '/resources/watchers/:resourceName',
    });

    const handleSave = async () => {
        if (!resourceName) return;
        setIsSaving(true);
        const patterns = patternsText
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean);
        const cfg: WatcherConfig = { enabled, filterMode, patterns };
        await setWatcherApi({
            pathParams: { resourceName },
            data: cfg,
            toastLoadingMessage: 'Saving watcher...',
            finally: () => setIsSaving(false),
            success: () => onClose(cfg),
        });
    };

    const showPatterns = filterMode === 'include' || filterMode === 'exclude';

    const parsedPatterns = useMemo(
        () => patternsText.split('\n').map((p) => p.trim()).filter(Boolean),
        [patternsText],
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <EyeIcon className="size-5" />
                        Watch &ldquo;{displayName ?? resourceName}&rdquo;
                    </DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                    When enabled, txAdmin will watch this resource&apos;s directory for file
                    changes and automatically restart it.
                </p>

                <Alert variant="warning">
                    <TriangleAlertIcon className="size-4" />
                    <AlertDescription>
                        <strong>Not recommended for live servers.</strong>{' '}
                        File changes will restart this resource immediately, which can disrupt active players.
                        Only use this in a local development environment.
                    </AlertDescription>
                </Alert>

                <div className="space-y-4 py-1">
                    {/* Enable toggle */}
                    <div className="flex items-center gap-3">
                        <Switch
                            id="watcher-enabled"
                            checked={enabled}
                            onCheckedChange={setEnabled}
                        />
                        <Label htmlFor="watcher-enabled" className="cursor-pointer font-medium">
                            {enabled ? 'Watching enabled' : 'Watching disabled'}
                        </Label>
                    </div>

                    {/* Filter mode */}
                    <div className="space-y-1.5">
                        <Label>File filter</Label>
                        <Select
                            value={filterMode}
                            onValueChange={(v) => setFilterMode(v as WatcherFilterMode)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Watch all files</SelectItem>
                                <SelectItem value="include">Only watch matching files</SelectItem>
                                <SelectItem value="exclude">Watch all except matching files</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Patterns */}
                    {showPatterns && (
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Label htmlFor="watcher-patterns">Patterns</Label>
                                <span className="text-xs text-muted-foreground">(one per line)</span>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                                            <InfoIcon className="size-3.5" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 text-sm" side="top">
                                        <p className="font-medium mb-2">Example patterns</p>
                                        <div className="space-y-1.5">
                                            {PATTERN_EXAMPLES.map(({ pattern, desc }) => (
                                                <div key={pattern} className="flex items-baseline gap-2">
                                                    <code className="text-xs bg-muted px-1 py-0.5 rounded shrink-0">
                                                        {pattern}
                                                    </code>
                                                    <span className="text-xs text-muted-foreground">{desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <Textarea
                                id="watcher-patterns"
                                className="font-mono text-sm"
                                rows={4}
                                placeholder={'*.lua\ndata/*.json'}
                                value={patternsText}
                                onChange={(e) => setPatternsText(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Live preview */}
                    <PatternPreview filterMode={filterMode} patterns={parsedPatterns} />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onClose()} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
