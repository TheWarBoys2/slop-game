// The game's shared mutable state: the things more than one system replaces wholesale (lists that get filtered,
// counters, flags). Everything else lives in the module that owns it.
export const world = {};
