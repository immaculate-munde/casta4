export const ROLES = {
  underwriter: {
    id: 'underwriter',
    label: 'Underwriter / CAT analyst',
    description: 'Flood map, exposure tiers, and RAG copilot on the catastrophe desk.',
    home: '/catastrophe',
  },
  operations: {
    id: 'operations',
    label: 'Claims operations',
    description: 'Operations dashboard, claim pipeline, and ReAgent document Q&A.',
    home: '/dashboard',
  },
  admin: {
    id: 'admin',
    label: 'Administrator',
    description: 'Full access to dashboard, flood desk, and configuration views.',
    home: '/dashboard',
  },
};

export const ROLE_IDS = Object.keys(ROLES);

export function homeForRole(role) {
  return ROLES[role]?.home || '/dashboard';
}

export function canAccessPath(role, pathname) {
  if (role === 'admin') return true;
  if (role === 'underwriter') return pathname.startsWith('/catastrophe') || pathname === '/chat';
  if (role === 'operations') return pathname.startsWith('/dashboard') || pathname === '/chat';
  return false;
}
