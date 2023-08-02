import { Profiler } from './profiler';
import { PyInstrumentProfiler } from './pyinstrument';

/* create a registry for ids to profile classes */
interface ProfilerConstructor {
    new(): Profiler;
}
let profilerRegistry: { [id: string]: ProfilerConstructor } = {};
function register(id: string, ctor: ProfilerConstructor) {
    profilerRegistry[id] = ctor;
}

/**
 * A profiler factory that returns a Profiler instance for the given id.
 */
export function profilerFactory(id: string): Profiler {
    if (profilerRegistry.hasOwnProperty(id)) {
        return new profilerRegistry[id]();
    }
    throw new Error(`Profiler ${id} not registered.`);
}

/* register profilers */
register("PyInstrument", PyInstrumentProfiler);