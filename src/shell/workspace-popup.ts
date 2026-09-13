export interface WorkspacePopupConstraint {
    index?: number;
}

export interface WorkspacePopup {
    get_constraints(): WorkspacePopupConstraint[];
}

export function retargetWorkspacePopup(popup: WorkspacePopup | null, monitor: number): boolean {
    const constraint = popup
        ?.get_constraints()
        .find(candidate => typeof candidate.index === 'number');

    if (constraint === undefined) {
        return false;
    }

    constraint.index = monitor;
    return true;
}
