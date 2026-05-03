import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { execSync } from 'child_process';

import * as vscode from 'vscode';
import { ProfilerOutput } from '../../profileroutput';
import { ProfileTreeEditor } from '../../profiletree';
import { FlameGraphView } from '../../flamegraph';
import { getPythonPath, findPythonWithCache, getHatchetVersion } from '../../util';
import { isGmonProfileBytes, parseGprofText, readGprofProfileBytes } from '../../parsers/gprof';

const SIMPLE_GPROF_TEXT = `
Flat profile:

Each sample counts as 0.01 seconds.
  %   cumulative   self              self     total
 time   seconds   seconds    calls  ms/call  ms/call  name
100.00      0.03     0.03     1001     0.03     0.03  leaf
  0.00      0.03     0.00        1     0.00    29.97  branch

                        Call graph

index % time    self  children    called     name
                0.00    0.00       1/1001        main [2]
                0.03    0.00    1000/1001        branch [3]
[1]    100.0    0.03    0.00    1001         leaf [1]
-----------------------------------------------
                                                 <spontaneous>
[2]    100.0    0.00    0.03                 main [2]
                0.00    0.03       1/1           branch [3]
                0.00    0.00       1/1001        leaf [1]
-----------------------------------------------
                0.00    0.03       1/1           main [2]
[3]     99.9    0.00    0.03       1         branch [3]
                0.03    0.00    1000/1001        leaf [1]
-----------------------------------------------

Index by function name
`;

function hasAttribute(node: any, attribute: string): boolean {
    return Boolean(node.attributes[attribute]) || node.children.some((child: any) => hasAttribute(child, attribute));
}

function createFakePython(rootDir: string): string {
    const pythonDir = process.platform === 'win32' ? rootDir : path.join(rootDir, 'bin');
    fs.mkdirSync(pythonDir, { recursive: true });

    const pythonPath = path.join(pythonDir, process.platform === 'win32' ? 'python.exe' : 'python');
    const script =
        process.platform === 'win32'
            ? '@echo off\r\nif "%1"=="--version" echo Python 3.11.0\r\nexit /b 0\r\n'
            : '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Python 3.11.0"; fi\nexit 0\n';

    fs.writeFileSync(pythonPath, script);
    fs.chmodSync(pythonPath, 0o755);
    return pythonPath;
}

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
        const pythonPath = await getPythonPath(['hatchet', 'numpy']);
        assert.ok(pythonPath);
    });

    test('External Python is cached', async () => {
        const pythonPath = await findPythonWithCache(extensionContext, ['hatchet', 'numpy'], true);
        assert.ok(pythonPath);

        assert.ok(extensionContext.workspaceState.get<string>('pythonWithHatchetPath'));
        assert.strictEqual(extensionContext.workspaceState.get<string>('pythonWithHatchetPath'), pythonPath);
    });

    test('Finds Python when module imports succeed without stdout', async function () {
        if (process.platform === 'win32') {
            this.skip();
        }

        const previousPython3RootDir = process.env.Python3_ROOT_DIR;
        const fakePythonRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'profile viewer python root '));
        const fakePythonPath = createFakePython(fakePythonRoot);

        try {
            process.env.Python3_ROOT_DIR = fakePythonRoot;

            const pythonPath = await getPythonPath(['hatchet', 'numpy']);

            assert.strictEqual(pythonPath, fakePythonPath);
        } finally {
            if (previousPython3RootDir === undefined) {
                delete process.env.Python3_ROOT_DIR;
            } else {
                process.env.Python3_ROOT_DIR = previousPython3RootDir;
            }
        }
    });

    test('Configured Python path takes precedence over cached Python', async () => {
        const profileViewerConfig = vscode.workspace.getConfiguration('profileviewer');
        const previousConfiguredPython = profileViewerConfig.inspect<string | null>('pythonPath')?.globalValue;
        const previousCachedPython = extensionContext.workspaceState.get<string>('pythonWithHatchetPath');
        const configuredPython = path.join(os.tmpdir(), 'configured python');
        const cachedPython = path.join(os.tmpdir(), 'cached python');

        try {
            await extensionContext.workspaceState.update('pythonWithHatchetPath', cachedPython);
            await profileViewerConfig.update('pythonPath', configuredPython, vscode.ConfigurationTarget.Global);

            const pythonPath = await findPythonWithCache(extensionContext, ['hatchet'], true);

            assert.strictEqual(pythonPath, configuredPython);
            assert.strictEqual(extensionContext.workspaceState.get<string>('pythonWithHatchetPath'), configuredPython);
        } finally {
            await profileViewerConfig.update('pythonPath', previousConfiguredPython, vscode.ConfigurationTarget.Global);
            await extensionContext.workspaceState.update('pythonWithHatchetPath', previousCachedPython);
        }
    });
});

suite('GProf Parser Tests', () => {
    test('Parse GProf call graph text', () => {
        const tree = parseGprofText(SIMPLE_GPROF_TEXT);

        assert.strictEqual(tree.length, 1);
        assert.strictEqual(tree[0].name, 'main');
        assert.strictEqual(tree[0].metrics['time (inc)'], 0.03);
        assert.strictEqual(tree[0].children[0].name, 'leaf');
        assert.strictEqual(tree[0].children[1].name, 'branch');
        assert.strictEqual(tree[0].attributes.hot_path, true);
        assert.strictEqual(tree[0].children[1].children[0].attributes.duplicate, true);
    });

    test('Parse C++ function names', () => {
        const tree = parseGprofText(`
Call graph

index % time    self  children    called     name
                                                 <spontaneous>
[1]    100.0    0.01    0.00       1         std::vector<double, std::allocator<double> >::operator[](unsigned long) const [1]
-----------------------------------------------
`);

        assert.strictEqual(
            tree[0].name,
            'std::vector<double, std::allocator<double> >::operator[](unsigned long) const'
        );
    });

    test('Parse multiple spontaneous roots', () => {
        const tree = parseGprofText(`
Call graph

index % time    self  children    called     name
                                                 <spontaneous>
[1]     75.0    0.03    0.00       1         alpha [1]
-----------------------------------------------
                                                 <spontaneous>
[2]     25.0    0.01    0.00       1         beta [2]
-----------------------------------------------
`);

        assert.deepStrictEqual(
            tree.map(node => node.name),
            ['alpha', 'beta']
        );
    });

    test('Stops recursive cycles', () => {
        const tree = parseGprofText(`
Call graph

index % time    self  children    called     name
                                                 <spontaneous>
[1]    100.0    0.01    0.02       1         main [1]
                0.01    0.01       1/1           alpha <cycle 1> [2]
-----------------------------------------------
                0.01    0.01       1/1           main [1]
                0.00    0.01       1             beta <cycle 1> [3]
[2]     66.7    0.01    0.01       1         alpha <cycle 1> [2]
                0.00    0.01       1             beta <cycle 1> [3]
-----------------------------------------------
                0.00    0.01       1             alpha <cycle 1> [2]
[3]     33.3    0.00    0.01       1         beta <cycle 1> [3]
                0.01    0.01       1             alpha <cycle 1> [2]
-----------------------------------------------
`);

        assert.strictEqual(hasAttribute(tree[0], 'recursive'), true);
    });

    test('Rejects flat-profile-only text', () => {
        assert.throws(() => parseGprofText('Flat profile:\nleaf 0.01\n'), /call graph/i);
    });

    test('Detects raw gmon.out and parses mocked gprof output', async () => {
        const gmonBytes = Buffer.from([0x67, 0x6d, 0x6f, 0x6e, 0x00]);
        assert.strictEqual(isGmonProfileBytes(gmonBytes), true);

        const tree = await readGprofProfileBytes(gmonBytes, 'gmon.out', {
            executablePath: 'sample',
            runGprof: async (executablePath: string, profilePath: string) => {
                assert.strictEqual(executablePath, 'sample');
                assert.strictEqual(profilePath, 'gmon.out');
                return SIMPLE_GPROF_TEXT;
            },
        });

        assert.strictEqual(tree[0].name, 'main');
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

        const fpath = vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders![0].uri,
            'pyinstrument',
            'pyinstrument.json'
        );
        let profile = new ProfilerOutput(fpath, 'pyinstrument', false);

        assert.strictEqual(profile.type, 'pyinstrument');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 1);
        assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0.1705) < 0.0001);
    });

    test('Open CProfile Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'cprofile', 'cprofile.pstats');
        let profile = new ProfilerOutput(fpath, 'cprofile', false);

        assert.strictEqual(profile.type, 'cprofile');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 2);
        assert.ok(
            Math.abs(tree.getMaxInclusiveTime() - 23.0226) < 0.0001,
            `Expected ${tree.getMaxInclusiveTime()} to be close to 23.0226`
        );
    });

    test('Open Caliper Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'caliper', 'caliper.json');
        let profile = new ProfilerOutput(fpath, 'caliper', false);

        assert.strictEqual(profile.type, 'caliper');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 1);
        assert.ok(Math.abs(tree.getMaxInclusiveTime() - 5889901.5) < 0.0001);
    });

    test('Open GProf Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'gprof', 'gprof.txt');
        let profile = new ProfilerOutput(fpath, 'gprof', false);

        assert.strictEqual(profile.type, 'gprof');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 1);
        assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0.03) < 0.0001);
    });

    test('Open legacy GProf DOT Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'gprof', 'gprof.dot');
        let profile = new ProfilerOutput(fpath, 'gprof', false);

        assert.strictEqual(profile.type, 'gprof');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.ok(tree.roots.length > 0);
        assert.ok(Math.abs(tree.getMaxInclusiveTime() - 97.95) < 0.0001);
    });

    test('Open Timemory Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'timemory', 'timemory.json');
        let profile = new ProfilerOutput(fpath, 'timemory', false);

        assert.strictEqual(profile.type, 'timemory');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 2);
        assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0) < 0.0001);
    });

    test('Open HPCToolkit Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders![0].uri,
            'hpctoolkit',
            'hpctoolkit-database'
        );
        let profile = new ProfilerOutput(fpath, 'hpctoolkit', true);

        assert.strictEqual(profile.type, 'hpctoolkit');
        assert.strictEqual(profile.isDirectory, true);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 2);
        assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0.01761375) < 0.0001);
    });

    test('Open Tau Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'tau', 'tau-profile');
        let profile = new ProfilerOutput(fpath, 'tau', true);

        assert.strictEqual(profile.type, 'tau');
        assert.strictEqual(profile.isDirectory, true);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 1);
        assert.ok(Math.abs(tree.getMaxInclusiveTime() - 53511.75) < 0.0001);
    });

    test('Open ScoreP Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'scorep', 'scorep.cubex');
        let profile = new ProfilerOutput(fpath, 'scorep', false);

        assert.strictEqual(profile.type, 'scorep');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 1);

        const hatchetVersion = await getHatchetVersion();
        if (hatchetVersion === '1.3.1') {
            assert.ok(Math.abs(tree.getMaxMetricValue('max_time (inc)') - 5.0556) < 0.0001);
        } else {
            assert.ok(Math.abs(tree.getMaxInclusiveTime() - 5.0556) < 0.0001);
        }
    });

    test('Open JSON Profile', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'json', 'profile.json');
        let profile = new ProfilerOutput(fpath, 'json', false);

        assert.strictEqual(profile.type, 'json');
        assert.strictEqual(profile.isDirectory, false);

        let tree = await profile.getTree();
        assert.strictEqual(tree.roots.length, 1);
        assert.ok(Math.abs(tree.getMaxMetricValue('time (inc)') - 0.5) < 0.0001);
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
            scheme: 'profileTree',
            path: fpath.fsPath,
            query: JSON.stringify({ type: 'caliper' }),
        });

        assert.doesNotThrow(async () => {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                profileUri,
                ProfileTreeEditor.viewType,
                vscode.ViewColumn.One
            );
        });
    });

    test('Open FlameGraph View', async () => {
        assert.notEqual(vscode.workspace.workspaceFolders, undefined);

        const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'caliper', 'caliper.json');
        const profileUri = vscode.Uri.from({
            scheme: 'profileFlameGraph',
            path: fpath.fsPath,
            query: JSON.stringify({ type: 'caliper' }),
        });

        assert.doesNotThrow(async () => {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                profileUri,
                FlameGraphView.viewType,
                vscode.ViewColumn.One
            );
        });
    });
});
