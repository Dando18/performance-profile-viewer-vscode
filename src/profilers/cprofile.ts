import * as vscode from 'vscode';
import { Profiler } from './profiler';

/**
 * CProfile task definition
 */
interface CProfileTaskDefinition extends vscode.TaskDefinition {
    program: string;
    args?: string[];
    outputFile?: string;
    pythonCommand?: string;
}

/**
 * A Profiler implementation for CProfile.
 */
export class CProfileProfiler extends Profiler {

    constructor() {
        super("cProfile", "cprofile", false);
    }

    public isValidFormat(filePath: string): Promise<boolean> {
        /*  return true if filePath is a file */
        return new Promise<boolean>((resolve, _reject) => {
            vscode.workspace.fs.stat(vscode.Uri.file(filePath)).then((stat) => {
                resolve(stat.type === vscode.FileType.File);
            }, () => {
                resolve(false);
            });
        });
    }

    public isAvailable(): Promise<boolean> {
        /*  todo -- check if cprofile is installed */
        return new Promise<boolean>((resolve, _reject) => {
            resolve(true);
        });
    }

    public getCommandLine(_task: vscode.TaskDefinition): string {
        const task = _task as CProfileTaskDefinition;

        let cmdStr = task.pythonCommand || "python";
        cmdStr += " -m cProfile ";
        cmdStr += task.outputFile ? `-o ${task.outputFile} ` : "";
        cmdStr += task.program;
        cmdStr += task.args ? ` ${task.args.join(' ')}` : "";

        return cmdStr;
    }
}