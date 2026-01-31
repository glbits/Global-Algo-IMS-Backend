/**
 * Deny access for specific roles.
 * Usage: router.get('/x', auth, denyRoles('LeadManager'), handler)
 */
const denyRoles = (...blockedRoles) => {
    const blockedSet = new Set(blockedRoles);
    return (req, res, next) => {
      const role = req.user?.role;
      if (!role) return res.status(401).json({ msg: 'Unauthorized' });
      if (blockedSet.has(role)) return res.status(403).json({ msg: 'Forbidden' });
      next();
    };
  };
  
  module.exports = denyRoles;
  