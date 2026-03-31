export function canManageTeam(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function canManageConfig(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function canModifyAgents(role: string): boolean {
  return role !== 'viewer';
}
