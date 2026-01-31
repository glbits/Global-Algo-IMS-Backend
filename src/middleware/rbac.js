const User = require('../models/User');

// Higher number => more privilege
// NOTE: LeadManager is "admin-like" privilege for most modules,
// but certain modules are blocked explicitly via route-level deny middleware.
const ROLE_RANK = {
  Admin: 3,
  LeadManager: 3,
  BranchManager: 2,
  HR: 2,
  TeamLead: 1,
  Employee: 0
};

/**
 * Allow only specific roles.
 * Usage: router.get('/x', auth, authorizeRoles('Admin','HR'), handler)
 */
const authorizeRoles = (...allowedRoles) => {
  const allowedSet = new Set(allowedRoles);
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ msg: 'Unauthorized' });
    if (!allowedSet.has(role)) return res.status(403).json({ msg: 'Forbidden' });
    next();
  };
};

/**
 * Can assign/manage another user?
 * Admin/LeadManager can manage everyone below them.
 * HR/BM can manage TeamLead + Employee.
 * TeamLead can manage Employee.
 */
const canManageTargetUser = (actorRole, targetRole) => {
  if (ROLE_RANK[actorRole] === undefined) return false;
  if (ROLE_RANK[targetRole] === undefined) return false;

  // Never allow managing Admin unless actor is Admin
  if (targetRole === 'Admin' && actorRole !== 'Admin') return false;

  // Allow only if actor rank strictly higher than target rank
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
};

/**
 * Middleware: validates that the current user can manage the target user.
 * Expects target user id in:
 *  - req.body.assignedTo OR req.params.userId OR req.query.targetUserId
 */
const requireCanManageTarget = async (req, res, next) => {
  try {
    const targetId =
      req.body?.assignedTo || req.params?.userId || req.query?.targetUserId;
    if (!targetId) return res.status(400).json({ msg: 'Target user id missing' });

    const target = await User.findById(targetId).select('role');
    if (!target) return res.status(404).json({ msg: 'Target user not found' });

    if (!canManageTargetUser(req.user.role, target.role)) {
      return res
        .status(403)
        .json({ msg: 'You are not allowed to manage this user' });
    }

    req.targetUser = target;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  ROLE_RANK,
  authorizeRoles,
  canManageTargetUser,
  requireCanManageTarget
};
