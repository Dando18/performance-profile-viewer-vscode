import * as vscode from 'vscode';

/*  An abstract Profiler class that defines the interface for all profilers 
*   that can be used with the extension. */
export abstract class Profiler {
    /**
     * The name of the profiler
     */
    public readonly name: string;

    /**
     * Id for use in passing to the internal parsing script.
     */
    public readonly id: string;

    /**
     * Does this profiler output a directory (true) or a file (false)?
     */
    public readonly outputIsDirectory: boolean;

    constructor(name: string, id: string, outputIsDirectory: boolean) {
        this.name = name;
        this.id = id;
        this.outputIsDirectory = outputIsDirectory;
    }

    /**
     * Check if the given file is in a valid format for this profiler.
     * i.e. if the profiler expects a JSON, then is this a JSON file?
     * It does not determine if the file is a valid profile.
     */
    public abstract isValidFormat(filePath: string): Promise<boolean>;

    /**
     * Check if the given profiler is installed and available.
     */
    public abstract isAvailable(): Promise<boolean>;

    /**
     * Get the command line to run the profiler.
     */
    public abstract getCommandLine(_task: vscode.TaskDefinition): string;
}


/**
 * A Profiler implementation for HPCToolkit
 */
export class HPCToolkitProfiler extends Profiler {

    protected readonly createDatabase: boolean = true;
    protected readonly useMPI: boolean = false;

    constructor() {
        super("HPCToolkit", "hpctoolkit", true);
    }

    public isValidFormat(filePath: string): Promise<boolean> {
        /* check if there's an experiment.xml file in the directory */
        return new Promise<boolean>((resolve, _reject) => {
            const experimentFilePath = vscode.Uri.joinPath(vscode.Uri.file(filePath), "experiment.xml");
            vscode.workspace.fs.stat(experimentFilePath).then((stat) => {
                resolve(stat.type === vscode.FileType.File);
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

        /* todo -- create command */
        return "";
    }

}
