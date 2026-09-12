export interface WorkspaceConfiguration {
    dynamicWorkspaces: boolean;
    primaryOnly: boolean;
}

export function assertWorkspaceConfiguration(configuration: WorkspaceConfiguration): void {
    if (configuration.dynamicWorkspaces) {
        throw new Error('GIWS requires static workspaces');
    }

    if (configuration.primaryOnly) {
        throw new Error('GIWS requires workspaces to span all displays');
    }
}
