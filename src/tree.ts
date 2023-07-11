import * as vscode from 'vscode';


class ProfileTreeItem extends vscode.TreeItem {
    public children: ProfileTreeItem[] | undefined;

    constructor(label: string, time: number, maxTime: number, fileName: string | null, isOnHotPath: boolean, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(`${time.toFixed(3)}s  ${label}`, collapsibleState);

        /* set color */
        const normalizedTime = 1.0 - time / maxTime;
        const speedLevel = Math.round(normalizedTime * 10);
        this.resourceUri = vscode.Uri.parse("profileviewer://color/profileViewer.speed" + speedLevel);

        /* set icon to fire emoji if on hot path */
        if (isOnHotPath) {
            this.iconPath = new vscode.ThemeIcon('flame');
        }

        if (fileName) {
            this.description = fileName;
            let command = {"command": "vscode.open", "title": "", "arguments": [vscode.Uri.file(fileName)]};
            this.command = command;
        }
    }
};

export class ProfileDataProvider implements vscode.TreeDataProvider<ProfileTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProfileTreeItem | undefined> = new vscode.EventEmitter<ProfileTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ProfileTreeItem | undefined> = this._onDidChangeTreeData.event;

    private profileData: any;
    private maxTime: number = 0;

    setProfileData(data: any) {
        this.profileData = data;
        this.maxTime = this._computeMaxTime(data);
        this.refresh();
    }

    _computeMaxTime(data: any): number {
        let maxTime = 0;
        for (const row of data) {
            const time = row.metrics["time (inc)"];
            if (time > maxTime) {
                maxTime = time;
            }
            if (row.children) {
                const childMaxTime = this._computeMaxTime(row.children);
                if (childMaxTime > maxTime) {
                    maxTime = childMaxTime;
                }
            }
        }
        return maxTime;
    }

    getTreeItem(element: ProfileTreeItem): vscode.TreeItem{
        return element;
    }

    getChildren(element?: ProfileTreeItem): Thenable<ProfileTreeItem[]> {
        if (!element) {
            const rootItems: ProfileTreeItem[] = [];

            if (this.profileData) {
                this.createTreeItems(rootItems, this.profileData);
            }

            return Promise.resolve(rootItems);
        } else {
            if (element.children) {
                return Promise.resolve(element.children);
            } else {
                return Promise.resolve([]);
            }
        }
    }

    createTreeItems(treeItems: ProfileTreeItem[], data: any) {
        for (const row of data) {
            const time = row.metrics["time (inc)"];
            const isOnHotPath = row.attributes.hasOwnProperty("hot_path") ? row.attributes.hot_path : false;
            const fileName = row.attributes.hasOwnProperty("file") ? row.attributes.file : null;

            const item = new ProfileTreeItem(row.name, time, this.maxTime, fileName, isOnHotPath, vscode.TreeItemCollapsibleState.None);
            treeItems.push(item);

            if (row.children) {
                item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                item.children = [];
                this.createTreeItems(item.children, row.children);
            }
        }
    }

    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
};



export class ProfileColorProvider implements vscode.FileDecorationProvider {
    private disposables: Array<vscode.Disposable> = [];

    constructor() {
        this.disposables = [];
        this.disposables.push(vscode.window.registerFileDecorationProvider(this));
    }

    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | null> {
        if (uri.scheme === "profileviewer" && uri.authority === "color") {
            /* remove / from beginning of path */
            const color = uri.path.substring(1);
            return {
                color: new vscode.ThemeColor(color)
            };
        }
        return null;
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
};
