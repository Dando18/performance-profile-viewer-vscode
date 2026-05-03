import * as vscode from 'vscode';
import { spawn } from 'child_process';

export interface GprofProfileReadOptions {
    executablePath?: string;
    runGprof?: (executablePath: string, profilePath: string) => Promise<string>;
}

interface GprofTreeNode {
    name: string;
    frame: any;
    metrics: any;
    attributes: any;
    children: GprofTreeNode[];
}

interface GprofFunction {
    id: string;
    sortIndex: number;
    name: string;
    module?: string;
    percentTime?: number;
    selfTime: number;
    childrenTime: number;
    calls?: number;
    recursiveCalls?: number;
    callees: Map<string, GprofCall>;
    incoming: Set<string>;
    spontaneous: boolean;
    isCycleSummary: boolean;
}

interface GprofCall {
    calleeId: string;
    calls?: number;
    totalCalls?: number;
}

interface FunctionReference {
    id: string;
    name: string;
    calls?: number;
    totalCalls?: number;
    spontaneous?: boolean;
}

interface PrimaryLine {
    id: string;
    name: string;
    percentTime: number;
    selfTime: number;
    childrenTime: number;
    calls?: number;
    recursiveCalls?: number;
    isCycleSummary: boolean;
}

class GprofGraphBuilder {
    private readonly functions = new Map<string, GprofFunction>();
    private nextSortIndex = 1;

    public ensureFunction(id: string, name?: string): GprofFunction {
        let func = this.functions.get(id);
        if (!func) {
            func = {
                id,
                sortIndex: this.getSortIndex(id),
                name: name || id,
                selfTime: 0,
                childrenTime: 0,
                callees: new Map<string, GprofCall>(),
                incoming: new Set<string>(),
                spontaneous: false,
                isCycleSummary: false,
            };
            this.functions.set(id, func);
        } else if (name && func.name === func.id) {
            func.name = name;
        }
        return func;
    }

    public setFunctionFromPrimary(primary: PrimaryLine) {
        const func = this.ensureFunction(primary.id, primary.name);
        func.name = primary.name;
        func.percentTime = primary.percentTime;
        func.selfTime = primary.selfTime;
        func.childrenTime = primary.childrenTime;
        func.calls = primary.calls;
        func.recursiveCalls = primary.recursiveCalls;
        func.isCycleSummary = primary.isCycleSummary;
    }

    public setFunctionFromDot(id: string, name: string, incTime: number, selfTime: number, module?: string) {
        const func = this.ensureFunction(id, name);
        func.name = name;
        func.module = module;
        func.percentTime = incTime;
        func.selfTime = selfTime;
        func.childrenTime = Math.max(0, incTime - selfTime);
    }

    public markSpontaneousRoot(id: string) {
        this.ensureFunction(id).spontaneous = true;
    }

    public addEdge(callerId: string, calleeId: string, calls?: number, totalCalls?: number) {
        const caller = this.ensureFunction(callerId);
        this.ensureFunction(calleeId);

        const existing = caller.callees.get(calleeId);
        if (existing) {
            existing.calls = existing.calls ?? calls;
            existing.totalCalls = existing.totalCalls ?? totalCalls;
        } else {
            caller.callees.set(calleeId, { calleeId, calls, totalCalls });
        }

        if (callerId !== calleeId) {
            this.ensureFunction(calleeId).incoming.add(callerId);
        }
    }

    public toTree(): GprofTreeNode[] {
        const functions = Array.from(this.functions.values()).filter(func => !func.isCycleSummary);
        if (functions.length === 0) {
            throw new Error('No functions were found in the GProf call graph.');
        }

        let roots = functions.filter(func => func.spontaneous || func.incoming.size === 0);
        if (roots.length === 0) {
            roots = functions;
        }

        const expanded = new Set<string>();
        const rootNodes = this.sortFunctions(roots).map(func => this.buildNode(func, new Set<string>(), expanded));
        this.markHotPath(rootNodes);
        return rootNodes;
    }

    private buildNode(func: GprofFunction, path: Set<string>, expanded: Set<string>): GprofTreeNode {
        const attributes: any = {};
        if (func.module) {
            attributes.module = func.module;
        }

        const node = this.createNode(func, attributes);

        if (path.has(func.id)) {
            node.attributes.recursive = true;
            return node;
        }

        if (expanded.has(func.id)) {
            node.attributes.duplicate = true;
            return node;
        }

        expanded.add(func.id);
        const nextPath = new Set(path);
        nextPath.add(func.id);

        const children = Array.from(func.callees.values())
            .map(call => this.functions.get(call.calleeId))
            .filter((child): child is GprofFunction => child !== undefined && !child.isCycleSummary);

        node.children = this.sortFunctions(children).map(child => this.buildNode(child, nextPath, expanded));
        return node;
    }

    private createNode(func: GprofFunction, attributes: any): GprofTreeNode {
        const inclusiveTime = func.selfTime + func.childrenTime;
        const metrics: any = {
            time: func.selfTime,
            ['time (inc)']: inclusiveTime,
        };

        if (func.percentTime !== undefined) {
            metrics['% time'] = func.percentTime;
        }
        if (func.calls !== undefined) {
            metrics.calls = func.calls;
        }
        if (func.recursiveCalls !== undefined) {
            metrics['recursive calls'] = func.recursiveCalls;
        }

        return {
            name: func.name,
            frame: { type: 'function', name: func.name },
            metrics,
            attributes,
            children: [],
        };
    }

    private sortFunctions(functions: GprofFunction[]): GprofFunction[] {
        return functions.sort((a, b) => {
            const timeDiff = b.selfTime + b.childrenTime - (a.selfTime + a.childrenTime);
            if (timeDiff !== 0) {
                return timeDiff;
            }
            return a.sortIndex - b.sortIndex;
        });
    }

    private markHotPath(roots: GprofTreeNode[]) {
        let current = roots.reduce<GprofTreeNode | undefined>((best, node) => {
            if (!best || node.metrics['time (inc)'] > best.metrics['time (inc)']) {
                return node;
            }
            return best;
        }, undefined);

        while (current) {
            current.attributes.hot_path = true;
            current = current.children.reduce<GprofTreeNode | undefined>((best, child) => {
                if (!best || child.metrics['time (inc)'] > best.metrics['time (inc)']) {
                    return child;
                }
                return best;
            }, undefined);
        }
    }

    private getSortIndex(id: string): number {
        const parsed = Number.parseInt(id, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        return this.nextSortIndex++;
    }
}

export function isGmonProfileBytes(bytes: Uint8Array): boolean {
    const sample = bytes.slice(0, Math.min(bytes.length, 4096));
    return startsWithAscii(sample, 'gmon') || sample.includes(0);
}

export async function readGprofProfile(
    uri: vscode.Uri,
    options: GprofProfileReadOptions = {}
): Promise<GprofTreeNode[]> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(uri.fsPath));
    return readGprofProfileBytes(bytes, uri.fsPath, options);
}

export async function readGprofProfileBytes(
    bytes: Uint8Array,
    profilePath: string,
    options: GprofProfileReadOptions = {}
): Promise<GprofTreeNode[]> {
    if (isGmonProfileBytes(bytes)) {
        if (!options.executablePath) {
            throw new Error('Raw gmon.out files require the executable that produced them.');
        }

        const runGprof = options.runGprof || runGprofCommand;
        const gprofOutput = await runGprof(options.executablePath, profilePath);
        return parseGprofText(gprofOutput);
    }

    const text = Buffer.from(bytes).toString('utf8');
    if (isGprofDotText(text)) {
        return parseGprofDot(text);
    }
    return parseGprofText(text);
}

export function runGprofCommand(executablePath: string, profilePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const process = spawn('gprof', ['-b', executablePath, profilePath]);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });
        process.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });
        process.on('error', (err: Error) => {
            reject(
                new Error(`Unable to run gprof. Make sure GNU gprof is installed and available on PATH. ${err.message}`)
            );
        });
        process.on('close', (code: number) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`gprof exited with code ${code}. ${stderr.trim()}`.trim()));
            }
        });
    });
}

export function parseGprofText(text: string): GprofTreeNode[] {
    const lines = text.replace(/\f/g, '\n').split(/\r?\n/);
    const headerIndex = lines.findIndex(line => /^\s*index\s+% time\s+self\s+children\s+called\s+name\s*$/i.test(line));
    if (headerIndex === -1) {
        throw new Error('Could not find a GProf call graph. Run gprof with call graph output enabled.');
    }

    const builder = new GprofGraphBuilder();
    for (const entry of collectGprofEntries(lines.slice(headerIndex + 1))) {
        const primaryIndex = entry.findIndex(line => parsePrimaryLine(line) !== undefined);
        if (primaryIndex === -1) {
            continue;
        }

        const primary = parsePrimaryLine(entry[primaryIndex]);
        if (!primary || primary.isCycleSummary) {
            continue;
        }

        builder.setFunctionFromPrimary(primary);

        for (const callerLine of entry.slice(0, primaryIndex)) {
            const caller = parseReferenceLine(callerLine);
            if (!caller) {
                continue;
            }
            if (caller.spontaneous) {
                builder.markSpontaneousRoot(primary.id);
                continue;
            }
            builder.ensureFunction(caller.id, caller.name);
            builder.addEdge(caller.id, primary.id, caller.calls, caller.totalCalls);
        }

        for (const calleeLine of entry.slice(primaryIndex + 1)) {
            const callee = parseReferenceLine(calleeLine);
            if (!callee || callee.spontaneous) {
                continue;
            }
            builder.ensureFunction(callee.id, callee.name);
            builder.addEdge(primary.id, callee.id, callee.calls, callee.totalCalls);
        }
    }

    return builder.toTree();
}

export function parseGprofDot(text: string): GprofTreeNode[] {
    const builder = new GprofGraphBuilder();
    for (const line of text.split(/\r?\n/)) {
        const edge = parseDotEdge(line);
        if (edge) {
            builder.addEdge(edge.from, edge.to);
            continue;
        }

        const node = parseDotNode(line);
        if (node) {
            builder.setFunctionFromDot(node.id, node.name, node.inclusiveTime, node.selfTime, node.module);
        }
    }
    return builder.toTree();
}

function collectGprofEntries(lines: string[]): string[][] {
    const entries: string[][] = [];
    let current: string[] = [];

    const flush = () => {
        if (current.length > 0) {
            entries.push(current);
            current = [];
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (/^index by function name/i.test(trimmed) || /^flat profile:/i.test(trimmed)) {
            break;
        }
        if (/^-{5,}$/.test(trimmed)) {
            flush();
            continue;
        }
        if (trimmed.length === 0) {
            continue;
        }
        current.push(line.replace(/\s+$/, ''));
    }
    flush();
    return entries;
}

function parsePrimaryLine(line: string): PrimaryLine | undefined {
    const match = line.match(/^\s*\[(\d+)\]\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!match) {
        return undefined;
    }

    const [, id, percentTimeText, selfTimeText, childrenTimeText, remainder] = match;
    const nameAndIndex = parseNameAndIndex(remainder);
    if (!nameAndIndex || nameAndIndex.id !== id) {
        return undefined;
    }

    const body = nameAndIndex.body;
    const callSplit = splitLeadingCallToken(body);
    const cycleInfo = normalizeCycleName(callSplit.name);

    return {
        id,
        name: cycleInfo.name,
        percentTime: parseNumber(percentTimeText),
        selfTime: parseNumber(selfTimeText),
        childrenTime: parseNumber(childrenTimeText),
        calls: callSplit.calls,
        recursiveCalls: callSplit.recursiveCalls,
        isCycleSummary: cycleInfo.isCycleSummary,
    };
}

function parseReferenceLine(line: string): FunctionReference | undefined {
    if (line.includes('<spontaneous>')) {
        return { id: '<spontaneous>', name: '<spontaneous>', spontaneous: true };
    }

    const nameAndIndex = parseNameAndIndex(line);
    if (!nameAndIndex) {
        return undefined;
    }

    const body = nameAndIndex.body;
    let name = body;
    let calls: number | undefined;
    let totalCalls: number | undefined;

    const fullMetrics = body.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (fullMetrics && isNumberToken(fullMetrics[1]) && isNumberToken(fullMetrics[2])) {
        const callCounts = parseCallRatio(fullMetrics[3]);
        if (callCounts) {
            calls = callCounts.calls;
            totalCalls = callCounts.totalCalls;
            name = fullMetrics[4];
        }
    } else {
        const callOnly = body.match(/^(\S+)\s+(.+)$/);
        if (callOnly) {
            const callCounts = parseCallRatio(callOnly[1]);
            if (callCounts) {
                calls = callCounts.calls;
                totalCalls = callCounts.totalCalls;
                name = callOnly[2];
            }
        }
    }

    const cycleInfo = normalizeCycleName(name);
    if (cycleInfo.isCycleSummary) {
        return undefined;
    }

    return {
        id: nameAndIndex.id,
        name: cycleInfo.name,
        calls,
        totalCalls,
    };
}

function parseNameAndIndex(text: string): { body: string; id: string } | undefined {
    const match = text.trim().match(/^(.*\S)\s+\[(\d+)\]\s*$/);
    if (!match) {
        return undefined;
    }
    return { body: match[1].trim(), id: match[2] };
}

function splitLeadingCallToken(body: string): { name: string; calls?: number; recursiveCalls?: number } {
    const match = body.match(/^(\S+)\s+(.+)$/);
    if (!match) {
        return { name: body };
    }

    const recursive = match[1].match(/^(\d+)\+(\d+)$/);
    if (recursive) {
        return {
            name: match[2],
            calls: Number.parseInt(recursive[1], 10),
            recursiveCalls: Number.parseInt(recursive[2], 10),
        };
    }

    if (/^\d+$/.test(match[1])) {
        return { name: match[2], calls: Number.parseInt(match[1], 10) };
    }

    return { name: body };
}

function parseCallRatio(token: string): { calls: number; totalCalls?: number } | undefined {
    const ratio = token.match(/^(\d+)\/(\d+)$/);
    if (ratio) {
        return { calls: Number.parseInt(ratio[1], 10), totalCalls: Number.parseInt(ratio[2], 10) };
    }

    if (/^\d+$/.test(token)) {
        return { calls: Number.parseInt(token, 10) };
    }

    return undefined;
}

function normalizeCycleName(name: string): { name: string; isCycleSummary: boolean } {
    const trimmed = name.trim();
    if (/^<cycle \d+ as a whole>$/.test(trimmed)) {
        return { name: trimmed, isCycleSummary: true };
    }

    return {
        name: trimmed.replace(/\s+<cycle \d+>$/, ''),
        isCycleSummary: false,
    };
}

function parseDotNode(
    line: string
): { id: string; name: string; module?: string; inclusiveTime: number; selfTime: number } | undefined {
    if (line.includes('->')) {
        return undefined;
    }

    const trimmed = line.trim();
    if (!trimmed || /^(digraph|graph|node|edge)\b/.test(trimmed)) {
        return undefined;
    }

    const idMatch = trimmed.match(/^(?:"((?:\\.|[^"])*)"|([^\s\[]+))\s+\[/);
    if (!idMatch) {
        return undefined;
    }

    const label = parseDotLabel(trimmed);
    if (!label) {
        return undefined;
    }

    const id = decodeDotString(idMatch[1] || idMatch[2]);
    const parts = label.split('\n');
    if (parts.length < 4) {
        return undefined;
    }

    const hasModule = parts.length >= 5;
    const module = hasModule ? parts[0] : undefined;
    const name = hasModule ? parts[1] : parts[0];
    const inclusiveTime = parsePercent(hasModule ? parts[2] : parts[1]);
    const selfTime = parsePercent(hasModule ? parts[3] : parts[2]);

    return { id, name, module, inclusiveTime, selfTime };
}

function parseDotEdge(line: string): { from: string; to: string } | undefined {
    const match = line.trim().match(/^(?:"((?:\\.|[^"])*)"|([^\s\[]+))\s*->\s*(?:"((?:\\.|[^"])*)"|([^\s\[]+))\s+\[/);
    if (!match) {
        return undefined;
    }

    return {
        from: decodeDotString(match[1] || match[2]),
        to: decodeDotString(match[3] || match[4]),
    };
}

function parseDotLabel(line: string): string | undefined {
    const match = line.match(/\blabel="((?:\\.|[^"])*)"/);
    if (!match) {
        return undefined;
    }
    return decodeDotString(match[1]).replace(/\\n/g, '\n');
}

function decodeDotString(value: string): string {
    return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function isGprofDotText(text: string): boolean {
    const trimmed = text.trimStart();
    return trimmed.startsWith('digraph') || trimmed.startsWith('strict digraph');
}

function startsWithAscii(bytes: Uint8Array, text: string): boolean {
    if (bytes.length < text.length) {
        return false;
    }
    for (let i = 0; i < text.length; i++) {
        if (bytes[i] !== text.charCodeAt(i)) {
            return false;
        }
    }
    return true;
}

function isNumberToken(token: string): boolean {
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token);
}

function parseNumber(token: string): number {
    const parsed = Number.parseFloat(token);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parsePercent(token: string): number {
    return parseNumber(token.replace(/[()%]/g, ''));
}
