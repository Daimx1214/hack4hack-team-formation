/**
 * Team serializer — the single place that shapes a Team document into the
 * API's public team object (Build Spec §10):
 *
 *   { id, name, description, capacity, memberCount, seatsLeft, isFull,
 *     isMember, isOwner, owner: { id, name }, members: [{ id, name, role,
 *     joinedAt }], skillsNeeded, createdAt }
 *
 * memberCount / seatsLeft / isFull are computed here, never stored as
 * separate truths (memberCount itself is the denormalised counter kept in
 * sync by the atomic join/leave writes). isMember / isOwner are relative
 * to the viewing user, so read endpoints run the optional-auth middleware.
 *
 * Read paths populate members.user and owner with the user's name before
 * calling this; unpopulated ObjectIds degrade gracefully to id-only names.
 */
function userIdOf(value) {
  if (!value) return null;
  if (typeof value === 'object') return (value._id || value.id || '').toString();
  return value.toString();
}

function userNameOf(value, fallbackId) {
  if (value && typeof value === 'object' && value.name) return value.name;
  return fallbackId;
}

function serializeTeam(team, viewerId) {
  const ownerId = userIdOf(team.owner);
  const members = (team.members || []).map((m) => {
    const id = userIdOf(m.user);
    return {
      id,
      name: userNameOf(m.user, id),
      role: m.role,
      joinedAt: m.joinedAt,
    };
  });
  const memberCount = team.memberCount != null ? team.memberCount : members.length;
  const seatsLeft = Math.max(0, team.capacity - memberCount);
  const viewer = viewerId ? viewerId.toString() : null;

  return {
    id: (team._id || team.id).toString(),
    name: team.name,
    description: team.description || '',
    capacity: team.capacity,
    memberCount,
    seatsLeft,
    isFull: seatsLeft === 0,
    isMember: viewer ? members.some((m) => m.id === viewer) : false,
    isOwner: viewer ? ownerId === viewer : false,
    owner: { id: ownerId, name: userNameOf(team.owner, ownerId) },
    members,
    skillsNeeded: team.skillsNeeded || [],
    createdAt: team.createdAt,
  };
}

module.exports = { serializeTeam };
