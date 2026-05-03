import * as vscode from 'vscode';
import { PROFILER_OUTPUT_TYPES } from './profileroutput';
import { ProfileTreeEditor } from './profiletree';
import { FlameGraphView } from './flamegraph';
import { ProfilerTaskProvider } from './profilertasks';
import { isGmonProfileBytes } from './parsers/gprof';

const SCHEME_TO_VIEW_TYPE: { [key: string]: string } = {
    profileTree: ProfileTreeEditor.viewType,
    profileFlameGraph: FlameGraphView.viewType,
};

async function selectPathAndOpen(source: string, expectsDir: boolean, schemes: string[]): Promise<void> {
    /* prompt user to select path to profile */
    const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: !expectsDir,
        canSelectFolders: expectsDir,
        canSelectMany: false,
        openLabel: 'Select Profile',
        title: 'Select Profile',
    });

    if (!fileUris || fileUris.length === 0) {
        return;
    }

    const profileQuery = await getProfileQuery(fileUris[0], source);
    if (!profileQuery) {
        return;
    }

    const filePath = fileUris[0].fsPath;
    const viewColumns = [vscode.ViewColumn.One, vscode.ViewColumn.Beside];
    let viewCounter = 0;
    for (const scheme of schemes) {
        const profileUri = getProfileUri(filePath, profileQuery, 'file');
        const editorId = SCHEME_TO_VIEW_TYPE[scheme];
        const column = viewColumns[viewCounter % viewColumns.length];
        viewCounter += 1;

        vscode.commands.executeCommand('vscode.openWith', profileUri, editorId, column);
    }
}

async function getProfileQuery(profileUri: vscode.Uri, profileType: string): Promise<any | undefined> {
    const query: any = { type: profileType };

    if (profileType !== 'gprof') {
        return query;
    }

    const contents = await vscode.workspace.fs.readFile(profileUri);
    if (!isGmonProfileBytes(contents)) {
        return query;
    }

    const executableUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Select Executable',
        title: 'Select Executable for gmon.out',
    });

    if (!executableUris || executableUris.length === 0) {
        vscode.window.showErrorMessage('Opening raw gmon.out requires selecting the executable that produced it.');
        return undefined;
    }

    query.executablePath = executableUris[0].fsPath;
    return query;
}

function openProfilePath(source: string, expectsDir: boolean, schemes: string[]): void {
    selectPathAndOpen(source, expectsDir, schemes).catch((error: Error) => {
        vscode.window.showErrorMessage(`Error opening profile: ${error.message}`);
    });
}

function openProfile(schemes: string[]): void {
    /* prompt for the type of profile to open */
    vscode.window
        .showQuickPick(Object.keys(PROFILER_OUTPUT_TYPES), {
            title: 'Select Profile Type',
            placeHolder: 'Open profile from...',
        })
        .then((profileType: string | undefined) => {
            if (profileType) {
                const isDirectory =
                    PROFILER_OUTPUT_TYPES[profileType as keyof typeof PROFILER_OUTPUT_TYPES].isDirectory;
                openProfilePath(profileType, isDirectory, schemes);
            }
        });
}

function getProfileUri(fpath: string | vscode.Uri, query: any, scheme: string): vscode.Uri {
    return vscode.Uri.from({
        scheme: scheme,
        path: fpath.toString(),
        query: JSON.stringify(query),
    });
}

export function activate(context: vscode.ExtensionContext) {
    /* create tree editor */
    new ProfileTreeEditor(context);

    /* flame graph editor */
    new FlameGraphView(context);

    /* register command to open profile */
    let openProfileCommand = vscode.commands.registerCommand('profileviewer.openProfile', () =>
        openProfile(['profileTree', 'profileFlameGraph'])
    );
    context.subscriptions.push(openProfileCommand);

    /* register command to open profile in tree editor */
    let openProfileTreeCommand = vscode.commands.registerCommand('profileviewer.openProfileTree', () =>
        openProfile(['profileTree'])
    );
    context.subscriptions.push(openProfileTreeCommand);

    /* register command to open profile in flame graph editor */
    let openProfileFlameGraphCommand = vscode.commands.registerCommand('profileviewer.openFlameGraph', () =>
        openProfile(['profileFlameGraph'])
    );
    context.subscriptions.push(openProfileFlameGraphCommand);

    // Set context as a global as some tests depend on it
    (global as any).testExtensionContext = context;

    /* register task provider */
    const pyinstrumentTaskProvider = new ProfilerTaskProvider('PyInstrument', 'PyInstrument');
    vscode.tasks.registerTaskProvider(pyinstrumentTaskProvider.taskType, pyinstrumentTaskProvider);

    const cProfileTaskProvider = new ProfilerTaskProvider('cProfile', 'cProfile');
    vscode.tasks.registerTaskProvider(cProfileTaskProvider.taskType, cProfileTaskProvider);

    const hpctoolkitTaskProvider = new ProfilerTaskProvider('HPCToolkit', 'HPCToolkit');
    vscode.tasks.registerTaskProvider(hpctoolkitTaskProvider.taskType, hpctoolkitTaskProvider);
}

export function deactivate() {}
