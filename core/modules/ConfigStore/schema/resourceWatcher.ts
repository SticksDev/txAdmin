import { z } from "zod";
import { typeDefinedConfig } from "./utils";
import { SYM_FIXER_DEFAULT } from "@lib/symbols";


const restartDebounceMs = typeDefinedConfig({
    name: 'Resource Watcher Restart Debounce (ms)',
    default: 700,
    validator: z.number().int().min(100).max(10_000),
    fixer: SYM_FIXER_DEFAULT,
});

const maxRestartsPerResource = typeDefinedConfig({
    name: 'Resource Watcher Max Restarts Per Resource',
    default: 5,
    validator: z.number().int().min(1).max(100),
    fixer: SYM_FIXER_DEFAULT,
});

const maxRestartsWindowSecs = typeDefinedConfig({
    name: 'Resource Watcher Max Restarts Window (seconds)',
    default: 60,
    validator: z.number().int().min(10).max(3600),
    fixer: SYM_FIXER_DEFAULT,
});


export default {
    restartDebounceMs,
    maxRestartsPerResource,
    maxRestartsWindowSecs,
} as const;
