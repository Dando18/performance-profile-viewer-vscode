import * as vscode from 'vscode';
import { Profiler } from './profiler';

/**
 * PyInstrument task definition
 */
interface PyInstrumentTaskDefinition extends vscode.TaskDefinition {
    program: string;
    args?: string[];
    outputFile?: string;
    openOutputFile?: boolean;
    renderer?: string;
}

/**
 * A Profiler implementation for PyInstrument.
 */
export class PyInstrumentProfiler extends Profiler {

    protected readonly renderer: string = "json";

    constructor() {
        super("PyInstrument", "pyinstrument", false);
    }

    public isValidFormat(filePath: string): Promise<boolean> {
        /*  return true if filePath is a file and points to a JSON file 
            todo -- check if contents of filePath are valid JSON */
        return new Promise<boolean>((resolve, _reject) => {
            vscode.workspace.fs.stat(vscode.Uri.file(filePath)).then((stat) => {
                resolve(stat.type === vscode.FileType.File);
            }, () => {
                resolve(false);
            });
        });
    }

    public isAvailable(): Promise<boolean> {
        /*  todo -- check if pyinstrument is installed */
        return new Promise<boolean>((resolve, _reject) => {
            resolve(true);
        });
    }

    public getCommandLine(_task: vscode.TaskDefinition): string {
        const task = _task as PyInstrumentTaskDefinition;

        let cmdStr = "pyinstrument ";
        cmdStr += task.renderer ? `--renderer ${task.renderer} ` : "";
        cmdStr += task.outputFile ? `--outfile ${task.outputFile} ` : "";
        cmdStr += task.program;
        cmdStr += task.args ? ` ${task.args.join(' ')}` : "";

        return cmdStr;
    }

}