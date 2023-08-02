import * as vscode from 'vscode';
import { Profiler } from './profilers/profiler';
import { profilerFactory } from './profilers/profilerregistry';

/**
 * Provides task definitions for profiling programs. Simply wraps the
 * Profiler.getCommandLine() method in a vscode.Task.
 */
export class ProfilerTaskProvider implements vscode.TaskProvider {
    public taskType: string;
    public profiler: Profiler;
    private profilePromise: Thenable<vscode.Task[]> | undefined = undefined;

    constructor(taskType: string, profilerName: string) {
        this.taskType = taskType;
        this.profiler = profilerFactory(profilerName);
    }

    public provideTasks(token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        if (!this.profilePromise) {
            /* todo -- add support for auto-detecting executables and/or current file */
        }
        return this.profilePromise;
    }

    public resolveTask(_task: vscode.Task, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        const task = _task.definition.type ? _task : undefined;
        if (task) {
            const name = task.definition.name || task.definition.program || task.definition.executable || task.definition.type;
            const commandLine: string = this.profiler.getCommandLine(task.definition);
            return new vscode.Task(
                task.definition,
                vscode.TaskScope.Workspace,
                `Profile ${name}`,
                task.definition.type,
                new vscode.ShellExecution(commandLine),
            );
        }
        return undefined;
    }
};