import * as vscode from 'vscode';
import { PROFILER_OUTPUT_TYPES } from './profileroutput';
import { ProfileTreeEditor } from './profiletree';
import { FlameGraphView } from './flamegraph';


const SCHEME_TO_VIEW_TYPE: {[key: string]: string} = {
	"profile-tree": ProfileTreeEditor.viewType,
	"profile-flamegraph": FlameGraphView.viewType
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

	/* register tree editor */
	let profileTreeEditor = new ProfileTreeEditor(context);
	vscode.window.registerCustomEditorProvider(ProfileTreeEditor.viewType, profileTreeEditor, {
			webviewOptions: {
				retainContextWhenHidden: true,
			}
		});

	/* flame graph editor */
	let flameGraphView = new FlameGraphView(context);
	vscode.window.registerCustomEditorProvider(FlameGraphView.viewType, flameGraphView, {
			webviewOptions: {
				retainContextWhenHidden: true,
			}
		});

	/* register commands */
	for (const [profileType, profileInfo] of Object.entries(PROFILER_OUTPUT_TYPES)) {
		const commandName = `profileviewer.open${profileInfo.name}Profile`;
		let command = vscode.commands.registerCommand(commandName, () => selectPathAndOpen(profileType, profileInfo.isDirectory, ["profile-tree", "profile-flamegraph"]));
		context.subscriptions.push(command);
	}

	let openProfileCommand = vscode.commands.registerCommand('profileviewer.openProfile', () => openProfile(["profile-tree", "profile-flamegraph"]));
	context.subscriptions.push(openProfileCommand);

}

export function deactivate() {}
