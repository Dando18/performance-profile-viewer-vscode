import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { getPythonPath } from './util';

/**
 * Types of supported profiler outputs and their properties.
 */
export const PROFILER_OUTPUT_TYPES = {
    hpctoolkit: {
        name: "HPCToolkit",
        isDirectory: true
    },
    caliper: {
        name: "Caliper",
        isDirectory: false
    },
    tau: {
        name: "TAU",
        isDirectory: true
    },
    pyinstrument: {
        name: "PyInstrument",
        isDirectory: false
    },
    scorep: {
        name: "ScoreP",
        isDirectory: false
    },
    gprof: {
        name: "GProf",
        isDirectory: false
    },
    timememory: {
        name: "TimeMemory",
        isDirectory: false
    },
    cprofile: {
        name: "CProfile",
        isDirectory: false
    },
};

/**
 * A node in the profiler output tree. Wraps the JSON output of the hatchet
 * parser script.
 */
export class ProfilerOutputNode {
    public readonly name: string;
    public readonly frame: any;
    public readonly metrics: any;
    public readonly attributes: any;
    public readonly children: ProfilerOutputNode[];
    public value: number | undefined;

    constructor(name: string, frame: any, metrics: any, attributes: any, children: ProfilerOutputNode[]) {
        this.name = name;
        this.frame = frame;
        this.metrics = metrics;
        this.attributes = attributes;
        this.children = children;
    }

    public static fromObject(obj: any): ProfilerOutputNode {
        if (!obj.children) {
            obj.children = [];
        }
        const children = obj.children.map((node: any) => ProfilerOutputNode.fromObject(node));
        return new ProfilerOutputNode(obj.name, obj.frame, obj.metrics, obj.attributes, children);
    }

    public getInclusiveTime(): number | undefined {
        return this.metrics["time (inc)" as keyof typeof this.metrics];
    }

    public getFilename(): string | undefined {
        return this.attributes.file;
    }

    public isOnHotPath(): boolean {
        return this.attributes.hasOwnProperty("hot_path") && this.attributes["hot_path"];
    }

    private async fileExists(filename: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(filename));
            return true;
        } catch (e) {
            return false;
        }
    }

    public async getResolvedFilename(): Promise<string | undefined> {
        /* check to see if file is available on filesystem -- if it is then return path to that */
        const filename = this.getFilename();
        if (filename) {
            /* first check if filename is absolute and already exists */
            if (await this.fileExists(filename)) {
                return filename;
            }

            /* now check if workspaceRoot + filename exists */
            let workspaceRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
            if (workspaceRoot) {
                if (await this.fileExists(vscode.Uri.joinPath(workspaceRoot, filename).fsPath)) {
                    return vscode.Uri.joinPath(workspaceRoot, filename).fsPath;
                }
            }
        }
        return undefined;
    }

    public getLine(): number | undefined {
        return this.attributes.line;
    }

    public setValueMetric(metricColumn: string, recursive: boolean = true) {
        this.value = this.metrics[metricColumn as keyof typeof this.metrics];
        if (recursive) {
            for (const child of this.children) {
                child.setValueMetric(metricColumn, recursive);
            }
        }
    }

    public toString(): string {
        return JSON.stringify(this);
    }
};

/**
 * The profile output tree. Wraps a list of root nodes.
 */
export class ProfilerOutputTree {
    public readonly roots: ProfilerOutputNode[];

    constructor(roots: ProfilerOutputNode[]) {
        this.roots = roots;
    }

    public getTreeWithSingleRoot(): ProfilerOutputNode {
        if (this.roots.length === 1) {
            return this.roots[0];
        } else {
            const rootIncTime = this.getMaxInclusiveTime();
            // eslint-disable-next-line @typescript-eslint/naming-convention
            return new ProfilerOutputNode("root", {name: "root", type: "root"}, {time: 0, "time (inc)": rootIncTime}, {}, this.roots);
        }
    }

    public static fromObject(obj: any): ProfilerOutputTree {
        const roots = obj.map((node: any) => ProfilerOutputNode.fromObject(node));
        return new ProfilerOutputTree(roots);
    }

    public static fromString(str: string): ProfilerOutputTree {
        return ProfilerOutputTree.fromObject(JSON.parse(str));
    }

    public toString(): string {
        return JSON.stringify(this);
    }

    public getMaxInclusiveTime(): number {
        /* no need to recursively check, since max inclusive runtime should be at one of the roots */
        return Math.max(...this.roots.map((root: ProfilerOutputNode) => root.getInclusiveTime() || 0));
    }

    public setValueMetric(metricColumn: string, recursive: boolean = true) {
        this.roots.forEach((root: ProfilerOutputNode) => root.setValueMetric(metricColumn, recursive));
    }
};


/**
 * This class is intended for interfacing with the profiler output files via hatchet.
 * It is initialized with a path to a profile output file, the type of profile output,
 * and a boolean indicating whether the output is a directory or not.
 * *note* this can also be encoded in a URI, which can be initialized from ProfilerOutput.fromUri
 * No data is read in until getTree() is called. This is to allow for lazy loading of the data.
 */
export class ProfilerOutput implements vscode.Disposable {
    public readonly uri: vscode.Uri;
    public readonly type: string;
    public readonly isDirectory: boolean;

    private process: ChildProcess | undefined;

    constructor(uri: vscode.Uri, type: string, isDirectory: boolean) {
        this.uri = uri;
        this.type = type;
        this.isDirectory = isDirectory;
    }

    public static fromUri(uri: vscode.Uri): ProfilerOutput {
        const query = JSON.parse(uri.query);
        const profileInfo = PROFILER_OUTPUT_TYPES[query.type as keyof typeof PROFILER_OUTPUT_TYPES];
        return new ProfilerOutput(uri, query.type, profileInfo.isDirectory);
    }

    public getTree(): Thenable<ProfilerOutputTree> {
        return new Promise<ProfilerOutputTree>((resolve, reject) => {
            getPythonPath().then((pythonPath: string | vscode.Uri) => {
                console.log(pythonPath);
                
                const pythonScriptPath = path.join(__dirname, '..', 'src', 'parse_profile.py');
                this.process = spawn(`${pythonPath}`, [pythonScriptPath, "--profile", this.uri.path, "--type", this.type, "--hot-path"]);

                // Collect the output from the Python script
                let output = '';
                if (this.process.stdout) {
                    this.process.stdout.on('data', (data: Buffer) => {
                        output += data.toString();
                    });
                }

                let stderr = '';
                if (this.process.stderr) {
                    this.process.stderr.on('data', (data: Buffer) => {
                        stderr += data.toString();
                    });
                }
        
                // Handle the completion of the Python script
                this.process.on('close', (code: number) => {
                if (code === 0) {
                    resolve(ProfilerOutputTree.fromString(output)); // Resolve the promise with the output
                } else {
                    try {
                        const error = JSON.parse(output).error;
                        reject(new Error(`${error.code} -- ${error.message}`));
                    } catch (e) {
                        reject(new Error(`Python script exited with code ${code}`));
                    }
                }
                });
        
                // Handle errors in the Python process
                this.process.on('error', (err: Error) => {
                reject(err);
                });
            });
		});
    }

    public dispose(): void {
        if (this.process) {
            this.process.kill();
        }
    }
};