const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, extractRoleId, hasPerm, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vcrole:delete:';

// ─── Helpers ───────────────────────────────────────────────────────

function getVcMembers(message) {
  const vc = message.member.voice?.channel;
  if (!vc) return { vc: null, members: [] };
  return { vc, members: [...vc.members.values()] };
}

function formatList(members) {
  if (!members.length) return '*None*';
  return members.map((m) => `> ${m.user.bot ? '🤖' : '👤'} ${m.user.tag}`).join('\n');
}

async function notInVoice(message) {
  await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: 'You must be in a voice channel to use `LR!vcrole`.' })));
}

async function noManageRoles(message) {
  await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Manage Roles** or **Administrator** permission.' })));
}

async function botNoManageRoles(message, ownerId) {
  await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Manage Roles** permission.', deletePrefix: DEL, ownerId })));
}

// ─── Subcommand: vcrole show / vcrole (default) ────────────────────

async function cmdShow(message) {
  const ownerId = message.author.id;
  const { vc, members } = getVcMembers(message);
  if (!vc) { await notInVoice(message); return; }

  const humans = members.filter((m) => !m.user.bot);
  const bots   = members.filter((m) => m.user.bot);

  await message.reply(cv2Payload(vcContainer({
    type: 'success',
    title: `VC Members — ${vc.name}`,
    description: [
      `**Channel:** ${vc}  |  **Total:** ${members.length}`,
      '',
      `**Humans (${humans.length}):**`,
      formatList(humans),
      `\n**Bots (${bots.length}):**`,
      formatList(bots),
    ].join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Subcommand: vcrole humans ─────────────────────────────────────

async function cmdHumans(message) {
  const ownerId = message.author.id;
  const { vc, members } = getVcMembers(message);
  if (!vc) { await notInVoice(message); return; }

  const humans = members.filter((m) => !m.user.bot);

  await message.reply(cv2Payload(vcContainer({
    type: 'success',
    title: `Humans in ${vc.name}`,
    description: `**Count:** ${humans.length}\n\n${formatList(humans)}`,
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Subcommand: vcrole humans add @role ───────────────────────────

async function cmdHumansAdd(message, args) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.ManageRoles)) { await noManageRoles(message); return; }
  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.ManageRoles)) { await botNoManageRoles(message, ownerId); return; }

  const { vc, members } = getVcMembers(message);
  if (!vc) { await notInVoice(message); return; }

  const roleId = extractRoleId(args[2]);
  if (!roleId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcrole humans add @role`' })));
    return;
  }

  const role = message.guild.roles.cache.get(roleId);
  if (!role) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Role Not Found', description: 'Could not find that role.' })));
    return;
  }

  const humans = members.filter((m) => !m.user.bot && !m.roles.cache.has(roleId));
  if (!humans.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Nothing to Do', description: `All humans in ${vc} already have the **${role.name}** role.` })));
    return;
  }

  let done = 0; let failed = 0;
  for (const m of humans) {
    try { await m.roles.add(role, `vcrole humans add by ${message.author.tag}`); done++; }
    catch { failed++; }
  }

  await message.channel.send(cv2Payload(vcContainer({
    type: done > 0 ? 'success' : 'error',
    title: 'Role Added to Humans',
    description: [
      `> **Role:** ${role}`,
      `> **Channel:** ${vc}`,
      `> **Added:** ${done} member${done === 1 ? '' : 's'}`,
      failed > 0 ? `> **Failed:** ${failed}` : null,
    ].filter(Boolean).join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Subcommand: vcrole humans remove @role ────────────────────────

async function cmdHumansRemove(message, args) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.ManageRoles)) { await noManageRoles(message); return; }
  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.ManageRoles)) { await botNoManageRoles(message, ownerId); return; }

  const { vc, members } = getVcMembers(message);
  if (!vc) { await notInVoice(message); return; }

  const roleId = extractRoleId(args[2]);
  if (!roleId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcrole humans remove @role`' })));
    return;
  }

  const role = message.guild.roles.cache.get(roleId);
  if (!role) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Role Not Found', description: 'Could not find that role.' })));
    return;
  }

  const humans = members.filter((m) => !m.user.bot && m.roles.cache.has(roleId));
  if (!humans.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Nothing to Do', description: `No humans in ${vc} have the **${role.name}** role.` })));
    return;
  }

  let done = 0; let failed = 0;
  for (const m of humans) {
    try { await m.roles.remove(role, `vcrole humans remove by ${message.author.tag}`); done++; }
    catch { failed++; }
  }

  await message.channel.send(cv2Payload(vcContainer({
    type: done > 0 ? 'success' : 'error',
    title: 'Role Removed from Humans',
    description: [
      `> **Role:** ${role}`,
      `> **Channel:** ${vc}`,
      `> **Removed from:** ${done} member${done === 1 ? '' : 's'}`,
      failed > 0 ? `> **Failed:** ${failed}` : null,
    ].filter(Boolean).join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Subcommand: vcrole bots ───────────────────────────────────────

async function cmdBots(message) {
  const ownerId = message.author.id;
  const { vc, members } = getVcMembers(message);
  if (!vc) { await notInVoice(message); return; }

  const bots = members.filter((m) => m.user.bot);

  await message.reply(cv2Payload(vcContainer({
    type: 'success',
    title: `Bots in ${vc.name}`,
    description: `**Count:** ${bots.length}\n\n${formatList(bots)}`,
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Subcommand: vcrole bots add @role ────────────────────────────

async function cmdBotsAdd(message, args) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.ManageRoles)) { await noManageRoles(message); return; }
  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.ManageRoles)) { await botNoManageRoles(message, ownerId); return; }

  const { vc, members } = getVcMembers(message);
  if (!vc) { await notInVoice(message); return; }

  const roleId = extractRoleId(args[2]);
  if (!roleId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcrole bots add @role`' })));
    return;
  }

  const role = message.guild.roles.cache.get(roleId);
  if (!role) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Role Not Found', description: 'Could not find that role.' })));
    return;
  }

  const bots = members.filter((m) => m.user.bot && !m.roles.cache.has(roleId));
  if (!bots.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Nothing to Do', description: `All bots in ${vc} already have the **${role.name}** role.` })));
    return;
  }

  let done = 0; let failed = 0;
  for (const m of bots) {
    try { await m.roles.add(role, `vcrole bots add by ${message.author.tag}`); done++; }
    catch { failed++; }
  }

  await message.channel.send(cv2Payload(vcContainer({
    type: done > 0 ? 'success' : 'error',
    title: 'Role Added to Bots',
    description: [
      `> **Role:** ${role}`,
      `> **Channel:** ${vc}`,
      `> **Added:** ${done} bot${done === 1 ? '' : 's'}`,
      failed > 0 ? `> **Failed:** ${failed}` : null,
    ].filter(Boolean).join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Subcommand: vcrole bots remove @role ─────────────────────────

async function cmdBotsRemove(message, args) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.ManageRoles)) { await noManageRoles(message); return; }
  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.ManageRoles)) { await botNoManageRoles(message, ownerId); return; }

  const { vc, members } = getVcMembers(message);
  if (!vc) { await notInVoice(message); return; }

  const roleId = extractRoleId(args[2]);
  if (!roleId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcrole bots remove @role`' })));
    return;
  }

  const role = message.guild.roles.cache.get(roleId);
  if (!role) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Role Not Found', description: 'Could not find that role.' })));
    return;
  }

  const bots = members.filter((m) => m.user.bot && m.roles.cache.has(roleId));
  if (!bots.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Nothing to Do', description: `No bots in ${vc} have the **${role.name}** role.` })));
    return;
  }

  let done = 0; let failed = 0;
  for (const m of bots) {
    try { await m.roles.remove(role, `vcrole bots remove by ${message.author.tag}`); done++; }
    catch { failed++; }
  }

  await message.channel.send(cv2Payload(vcContainer({
    type: done > 0 ? 'success' : 'error',
    title: 'Role Removed from Bots',
    description: [
      `> **Role:** ${role}`,
      `> **Channel:** ${vc}`,
      `> **Removed from:** ${done} bot${done === 1 ? '' : 's'}`,
      failed > 0 ? `> **Failed:** ${failed}` : null,
    ].filter(Boolean).join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Subcommand: vcrole reset ──────────────────────────────────────

async function cmdReset(message) {
  const ownerId = message.author.id;
  await message.reply(cv2Payload(vcContainer({
    type: 'success',
    title: 'VCRole — Command Guide',
    description: [
      '**Show members:**',
      '> `LR!vcrole show` — All members',
      '> `LR!vcrole humans` — Humans only',
      '> `LR!vcrole bots` — Bots only',
      '',
      '**Add a role:**',
      '> `LR!vcrole humans add @role`',
      '> `LR!vcrole bots add @role`',
      '',
      '**Remove a role:**',
      '> `LR!vcrole humans remove @role`',
      '> `LR!vcrole bots remove @role`',
    ].join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

// ─── Main router ───────────────────────────────────────────────────

async function execute({ message, args }) {
  const sub  = (args[0] || '').toLowerCase();
  const sub2 = (args[1] || '').toLowerCase();
  const sub3 = (args[2] || '').toLowerCase();

  if (!sub || sub === 'show')                                   return cmdShow(message);
  if (sub === 'humans' && !sub2)                                return cmdHumans(message);
  if (sub === 'humans' && sub2 === 'add')                       return cmdHumansAdd(message, args);
  if (sub === 'humans' && sub2 === 'remove')                    return cmdHumansRemove(message, args);
  if (sub === 'bots'   && !sub2)                                return cmdBots(message);
  if (sub === 'bots'   && sub2 === 'add')                       return cmdBotsAdd(message, args);
  if (sub === 'bots'   && sub2 === 'remove')                    return cmdBotsRemove(message, args);
  if (sub === 'reset')                                          return cmdReset(message);

  // Unknown subcommand → show help
  return cmdReset(message);
}

module.exports = {
  name: 'vcrole',
  aliases: ['voicerole', 'vcr'],
  category: 'voice',
  description: 'Manage roles for members in your voice channel (humans/bots).',
  usage: 'LR!vcrole [show | humans | humans add @role | humans remove @role | bots | bots add @role | bots remove @role | reset]',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
