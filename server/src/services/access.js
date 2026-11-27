import { ROLES } from '../models/roles.js';
import { HttpError } from '../utils/httpError.js';

const ids = (list) => (list || []).map((x) => String(x?._id || x));

export async function bookingScope(user) {
  switch (user.role) {
    case ROLES.SUPER_ADMIN:
      return {};
    case ROLES.INSTITUTE:
      return { institute: user.organization };
    case ROLES.NETWORK:
      return { center: { $in: user.centers || [] }, mode: 'online' };
    case ROLES.CENTER:
      return { center: { $in: user.centers || [] } };
    case ROLES.AGENCY:
      return { agency: user.organization };
    default:
      return { _id: null };
  }
}

export async function centerScope(user) {
  switch (user.role) {
    case ROLES.NETWORK:
    case ROLES.CENTER:
      return { _id: { $in: user.centers || [] } };
    default:
      return {};
  }
}

export function managesCenter(user, centerId) {
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return [ROLES.NETWORK, ROLES.CENTER].includes(user.role) && ids(user.centers).includes(String(centerId?._id || centerId));
}

export function canManageLab(user, centerId, labType) {
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (!managesCenter(user, centerId)) return false;
  if (user.role === ROLES.NETWORK) return labType === 'computer_lab';
  return labType !== 'computer_lab';
}

export function assertCanManageLab(user, centerId, labType) {
  if (!canManageLab(user, centerId, labType)) {
    throw new HttpError(403, labType === 'computer_lab' ? 'Only the Network Admin of this center manages computer labs' : 'Only the Center In-Charge of this center manages exam halls and classrooms');
  }
}
