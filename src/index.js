// Lynx Hot Update - Main entry point
module.exports = {
  init: require('./commands/init'),
  publish: require('./commands/publish'),
  rollback: require('./commands/rollback'),
  status: require('./commands/status'),
  config: require('./commands/config'),
  server: require('./commands/server'),
  promote: require('./commands/promote'),
  patch: require('./commands/patch'),
  history: require('./commands/history')
};
