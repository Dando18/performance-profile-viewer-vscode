import * as assert from 'assert';
import * as path from 'path';

import { execSync } from 'child_process';

import * as vscode from 'vscode';
import { ProfilerOutput } from '../../profileroutput';
import { ProfileTreeEditor } from '../../profiletree';
import { FlameGraphView } from '../../flamegraph';
import { getPythonPath, findPythonWithCache } from '../../util';

/* 	test that the external python environment is set up with hatchet.
	test that all the tools to find and interact with this environment work.
*/
suite('Environment Tests', () => {
	vscode.window.showInformationMessage('Starting environment tests.');

	let extension: vscode.Extension<any>;
	let extensionContext: vscode.ExtensionContext;
	suiteSetup(async () => {
		extension = vscode.extensions.getExtension('danielnichols.performance-profile-viewer')!;
		await extension?.activate();
		extensionContext = (global as any).testExtensionContext;
	});

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Extension is present', () => {
		assert.ok(extension);
	});

	test('Extension is active', async () => {
		assert.strictEqual(extension.isActive, true);
	});

	test('Find external Python', async () => {
		const pythonPath = await getPythonPath();
		assert.ok(pythonPath);
	});

	test('Run external Python', async () => {
		const pythonPath = await getPythonPath();
		assert.doesNotThrow(() => {
			execSync(`${pythonPath} --version`);
		});
	});

	test('Find external Python with hatchet and numpy', async () => {
		const pythonPath = await getPythonPath(["hatchet", "numpy"]);
		assert.ok(pythonPath);
	});

	test('External Python is cached', async () => {
		const pythonPath = await findPythonWithCache(extensionContext, ["hatchet", "numpy"], true);
		assert.ok(pythonPath);

		assert.ok(extensionContext.workspaceState.get<string>("pythonWithHatchetPath"));
		assert.strictEqual(extensionContext.workspaceState.get<string>("pythonWithHatchetPath"), pythonPath);
	});
});

/* test that the ProfilerOutput class works for all profile types */
suite('Profile Parsing Tests', () => {
	vscode.window.showInformationMessage('Starting profile parsing tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Open PyInstrument Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'pyinstrument', 'pyinstrument.json');
		let profile = new ProfilerOutput(fpath, "pyinstrument", false);

		assert.strictEqual(profile.type, "pyinstrument");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 1);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0.1705) < 0.0001);
	});

	test('Open CProfile Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'cprofile', 'cprofile.pstats');
		let profile = new ProfilerOutput(fpath, "cprofile", false);

		assert.strictEqual(profile.type, "cprofile");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 2);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 23.0226) < 0.0001, `Expected ${tree.getMaxInclusiveTime()} to be close to 23.0226`);
	});

	test('Open Caliper Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'caliper', 'caliper.json');
		let profile = new ProfilerOutput(fpath, "caliper", false);

		assert.strictEqual(profile.type, "caliper");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 1);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 5889901.5) < 0.0001);
	});

	/* TODO: fix this test; it works on any machine and environment I test it on
	 * but fails on the GitHub Actions runner. */
	/*test('Open GProf Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'gprof', 'gprof.dot');
		let profile = new ProfilerOutput(fpath, "gprof", false);

		assert.strictEqual(profile.type, "gprof");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 7);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 97.95) < 0.0001);
	});*/

	test('Open Timemory Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'timemory', 'timemory.json');
		let profile = new ProfilerOutput(fpath, "timemory", false);

		assert.strictEqual(profile.type, "timemory");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 2);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0) < 0.0001);
	});

	test('Open HPCToolkit Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'hpctoolkit', 'hpctoolkit-database');
		let profile = new ProfilerOutput(fpath, "hpctoolkit", true);

		assert.strictEqual(profile.type, "hpctoolkit");
		assert.strictEqual(profile.isDirectory, true);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 3);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 1307029.1) < 0.0001);
	});

	test('Open Tau Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'tau', 'tau-profile');
		let profile = new ProfilerOutput(fpath, "tau", true);

		assert.strictEqual(profile.type, "tau");
		assert.strictEqual(profile.isDirectory, true);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 1);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 53511.75) < 0.0001);
	});

	test('Open ScoreP Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'scorep', 'scorep.cubex');
		let profile = new ProfilerOutput(fpath, "scorep", false);

		assert.strictEqual(profile.type, "scorep");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 1);
		assert.ok(Math.abs(tree.getMaxMetricValue("max_time (inc)") - 5.0556) < 0.0001);
	});

	test('Open JSON Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'json', 'profile.json');
		let profile = new ProfilerOutput(fpath, "json", false);

		assert.strictEqual(profile.type, "json");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 1);
		assert.ok(Math.abs(tree.getMaxMetricValue("time (inc)") - 0.5) < 0.0001);
	});

});

suite('UI Tests', () => {
	vscode.window.showInformationMessage('Start UI tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Open Tree View', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'caliper', 'caliper.json');
		const profileUri = vscode.Uri.from({
			scheme: "profileTree",
			path: fpath.fsPath,
			query: JSON.stringify({type: "caliper"})
		});	

		assert.doesNotThrow(async () => {
			await vscode.commands.executeCommand('vscode.openWith', profileUri, ProfileTreeEditor.viewType, vscode.ViewColumn.One);
		});
	});

	test('Open FlameGraph View', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'caliper', 'caliper.json');
		const profileUri = vscode.Uri.from({
			scheme: "profileFlameGraph",
			path: fpath.fsPath,
			query: JSON.stringify({type: "caliper"})
		});	

		assert.doesNotThrow(async () => {
			await vscode.commands.executeCommand('vscode.openWith', profileUri, FlameGraphView.viewType, vscode.ViewColumn.One);
		});
	});

	
});
