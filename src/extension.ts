import * as vscode from 'vscode';
import { PROFILER_OUTPUT_TYPES } from './profileroutput';
import { ProfileTreeEditor } from './profiletree';
import { FlameGraphView } from './flamegraph';


const SCHEME_TO_VIEW_TYPE: {[key: string]: string} = {
	profileTree: ProfileTreeEditor.viewType,
	profileFlameGraph: FlameGraphView.viewType
};

function selectPathAndOpen(source: string, expectsDir: boolean, schemes: string[]): void  {
	/* prompt user to select path to profile */
	vscode.window.showOpenDialog({
		canSelectFiles: !expectsDir,
		canSelectFolders: expectsDir,
		canSelectMany: false,
		openLabel: 'Select Profile',
		title: 'Select Profile',
	}).then((fileUris: vscode.Uri[] | undefined) => {
		if (fileUris && fileUris.length > 0) {
			const filePath = fileUris[0].fsPath;
			const viewColumns = [vscode.ViewColumn.One, vscode.ViewColumn.Beside];
			let viewCounter = 0;
			for (const scheme of schemes) {
				const profileUri = getProfileUri(filePath, source, "file");
				const editorId = SCHEME_TO_VIEW_TYPE[scheme];
				const column = viewColumns[viewCounter % viewColumns.length];
				viewCounter += 1;

				vscode.commands.executeCommand('vscode.openWith', profileUri, editorId, column);
			}
		}
	});
}


function openProfile(schemes: string[]): void {
	/* prompt for the type of profile to open */
	vscode.window.showQuickPick(Object.keys(PROFILER_OUTPUT_TYPES), {title: "Select Profile Type", placeHolder: "Open profile from..."})
		.then((profileType: string | undefined) => {
			if (profileType) {
				const isDirectory = PROFILER_OUTPUT_TYPES[profileType as keyof typeof PROFILER_OUTPUT_TYPES].isDirectory;
				selectPathAndOpen(profileType, isDirectory, schemes);
			}
		});
}


function getProfileUri(fpath: string | vscode.Uri, profileType: string, scheme: string): vscode.Uri {
	return vscode.Uri.from({
		scheme: scheme,
		path: fpath.toString(),
		query: JSON.stringify({type: profileType})
	});
}

export function activate(context: vscode.ExtensionContext) {

	/* create tree editor */
	new ProfileTreeEditor(context);

	/* flame graph editor */
	new FlameGraphView(context);

	/* register command to open profile */
	let openProfileCommand = vscode.commands.registerCommand('profileviewer.openProfile', () => openProfile(["profileTree", "profileFlameGraph"]));
	context.subscriptions.push(openProfileCommand);

	/* register command to open profile in tree editor */
	let openProfileTreeCommand = vscode.commands.registerCommand('profileviewer.openProfileTree', () => openProfile(["profileTree"]));
	context.subscriptions.push(openProfileTreeCommand);

	/* register command to open profile in flame graph editor */
	let openProfileFlameGraphCommand = vscode.commands.registerCommand('profileviewer.openFlameGraph', () => openProfile(["profileFlameGraph"]));
	context.subscriptions.push(openProfileFlameGraphCommand);

	// Set context as a global as some tests depend on it
    (global as any).testExtensionContext = context;
}

export function deactivate() {}
