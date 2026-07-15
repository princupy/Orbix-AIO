const { cleanupLeftGuildSettings, resetGuildSettings } = require('../supabase/guildSettings');
const {
  cleanupLeftMediaOnlyChannels,
  resetMediaOnlyChannels,
} = require('../supabase/mediaOnlyChannels');
const {
  cleanupLeftLevelingData,
  resetLevelingData,
} = require('../supabase/leveling');
const {
  cleanupLeftSetupRoleData,
  resetSetupRoleData,
} = require('../supabase/setupRoles');

async function cleanupLeftGuildData(activeGuildIds) {
  const settingsResult = await cleanupLeftGuildSettings(activeGuildIds);
  const mediaResult = await cleanupLeftMediaOnlyChannels(activeGuildIds);
  const levelingResult = await cleanupLeftLevelingData(activeGuildIds);
  const setupRoleResult = await cleanupLeftSetupRoleData(activeGuildIds);

  if (!mediaResult.ok) {
    console.warn(`[supabase] Failed to clean up media-only channels: ${mediaResult.reason}`);
  }

  if (!levelingResult.ok) {
    console.warn(`[supabase] Failed to clean up leveling data: ${levelingResult.reason}`);
  }

  if (!setupRoleResult.ok) {
    console.warn(`[supabase] Failed to clean up setup-role data: ${setupRoleResult.reason}`);
  }

  return settingsResult;
}

async function handleGuildDelete(guild) {
  const result = await resetGuildSettings(guild.id);
  const mediaResult = await resetMediaOnlyChannels(guild.id);
  const levelingResult = await resetLevelingData(guild.id);
  const setupRoleResult = await resetSetupRoleData(guild.id);

  if (!result.ok) {
    console.warn(`[supabase] Failed to reset settings for guild ${guild.id}: ${result.reason}`);
    return;
  }

  if (!mediaResult.ok) {
    console.warn(`[supabase] Failed to reset media-only channels for guild ${guild.id}: ${mediaResult.reason}`);
  }

  if (!levelingResult.ok) {
    console.warn(`[supabase] Failed to reset leveling data for guild ${guild.id}: ${levelingResult.reason}`);
  }

  if (!setupRoleResult.ok) {
    console.warn(`[supabase] Failed to reset setup-role data for guild ${guild.id}: ${setupRoleResult.reason}`);
  }

  console.log(`Reset settings for guild ${guild.id}`);
}

module.exports = {
  cleanupLeftGuildSettings: cleanupLeftGuildData,
  handleGuildDelete,
};
