export interface WorkspacePopupConstraint {
    index?: number;
}

export interface WorkspacePopup {
    display(activeWorkspaceIndex: number): void;
    get_constraints(): WorkspacePopupConstraint[];
}

export function retargetWorkspacePopup(
    popup: WorkspacePopup | null,
    monitor: number,
    logicalWorkspace: number
): boolean {
    const constraint = popup
        ?.get_constraints()
        .find(candidate => typeof candidate.index === 'number');

    if (constraint === undefined) {
        return false;
    }

    constraint.index = monitor;
    popup?.display(logicalWorkspace);
    return true;
}
