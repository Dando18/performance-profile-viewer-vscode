import * as vscode from 'vscode';
import { Profiler } from './profiler';

/**
 * HPCToolkit task definition
 */
interface HPCToolkitTaskDefinition extends vscode.TaskDefinition {
    program: string;
    measurementsDirectory: string;
    outputDirectory?: string;
    args?: string[];
    metrics?: string[];
    createDatabase?: boolean;
    howOften?: string;
    trace?: boolean;
    useMPI?: boolean;
    mpiCmd?: string;
    mpiRanks?: number;
    metricDB?: string;
}

/**
 * A Profiler implementation for HPCToolkit
 */
export class HPCToolkitProfiler extends Profiler {

    constructor() {
        super("HPCToolkit", "hpctoolkit", true);
    }

    public isValidFormat(filePath: string): Promise<boolean> {
        /*  check if filePath is a directory, then
            check if there's an experiment.xml file in the directory */
        return new Promise<boolean>((resolve, _reject) => {
            vscode.workspace.fs.stat(vscode.Uri.file(filePath)).then((stat) => {
                if (stat.type !== vscode.FileType.Directory) {
                    resolve(false);
                }
                const experimentFilePath = vscode.Uri.joinPath(vscode.Uri.file(filePath), "experiment.xml");
                vscode.workspace.fs.stat(experimentFilePath).then((stat) => {
                    resolve(stat.type === vscode.FileType.File);
                }, () => {
                    resolve(false);
                });
            }, () => {
                resolve(false);
            });
        });
    }

    public isAvailable(): Promise<boolean> {
        /*  todo -- check if hpcrun is installed */
        return new Promise<boolean>((resolve, _reject) => {
            resolve(true);
        });
    }

    public getCommandLine(_task: vscode.TaskDefinition): string {
        const task = _task as HPCToolkitTaskDefinition;

        let hpcrunCmdStr = "";
        if (task.useMPI) {
            const ranks = task.mpiRanks || 1;
            const mpiCmd = task.mpiCmd || "mpirun";
            hpcrunCmdStr += `${mpiCmd} -n ${ranks} `;
        }

        hpcrunCmdStr += `hpcrun -o ${task.measurementsDirectory} `;
        hpcrunCmdStr += (task.metrics) ? task.metrics.join(" -e ") : "";
        hpcrunCmdStr += (task.howOften) ? ` -c ${task.howOften} ` : "";
        hpcrunCmdStr += (task.trace) ? " -t " : "";
        hpcrunCmdStr += task.program;
        hpcrunCmdStr += (task.args) ? ` ${task.args.join(" ")} ` : "";

        if (!task.createDatabase) {
            return hpcrunCmdStr;
        }

        return hpcrunCmdStr;
    }   
}