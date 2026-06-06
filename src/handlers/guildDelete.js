const { cleanupLeftGuildSettings, resetGuildSettings } = require('../supabase/guildSettings');

async function handleGuildDelete(guild) {
  const result = await resetGuildSettings(guild.id);

  if (!result.ok) {
    console.warn(`[supabase] Failed to reset settings for guild ${guild.id}: ${result.reason}`);
    return;
  }

  console.log(`Reset settings for guild ${guild.id}`);
}

module.exports = {
  cleanupLeftGuildSettings,
  handleGuildDelete,
};
