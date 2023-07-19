import * as vscode from 'vscode';
import * as process from 'child_process';


function doesPythonHaveModules(pythonPath: string, modules: string[]): boolean {
    try {
        let output = process.execSync(`${pythonPath} -c \"import ${modules.join("; import ")}\"`);
        if (output) {
            return true;
        }
    } catch (e) {
        console.log(e);
        return false;
    }
    return false;
}

/** A helper function to find the correct python to use in the shell.
 * First checks if the Python extension is installed, and if so, uses the
 * python.interpreterPath. 
 * If not, it checks the python.pythonPath setting.
 * Then try running `python3 --version` in shell. If it is successful, use that.
 * Otherwise, return "python"
 * @returns the path to the python executable
 */
export async function getPythonPath(imports?: string[]): Promise<string | vscode.Uri> {

    // check if the Python extension is installed
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");
    if (pythonExtension) {
        const python = await pythonExtension.activate();
        if (python && python.interpreterPath) {
            if (!imports || doesPythonHaveModules(python.interpreterPath, imports)) {
                return python.interpreterPath;
            }
        }
    }

    // check if the python.pythonPath setting is set
    const pythonPath = vscode.workspace.getConfiguration("python").get("pythonPath");
    if (pythonPath) {
        if (!imports || doesPythonHaveModules(pythonPath.toString(), imports)) {
            return pythonPath.toString();
        }
    }

    // check if python3 is available
    try {
        let output = process.execSync("python3 --version");
        if (output) {
            if (!imports || doesPythonHaveModules("python3", imports)) {
                return "python3";
            }
        }
    } catch (e) {}

    return "python";
}