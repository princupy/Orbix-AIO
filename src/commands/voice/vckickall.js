const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, hasPerm, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vckickall:delete:';

async function execute({ message }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Move Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Move Members** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const authorVc = message.member.voice?.channel;
  if (!authorVc) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: 'You must be in a voice channel to use this command.' })));
    return;
  }

  // Exclude the author themselves
  const targets = [...authorVc.members.values()].filter((m) => m.id !== message.author.id);
  if (!targets.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'No Members', description: `There are no other members to kick from ${authorVc}.` })));
    return;
  }

  let done = 0;
  let failedCount = 0;
  for (const m of targets) {
    try {
      await m.voice.disconnect(`vckickall by ${message.author.tag}`);
      done++;
    } catch {
      failedCount++;
    }
  }

  await message.channel.send(cv2Payload(vcContainer({
    type: done > 0 ? 'success' : 'error',
    title: done > 0 ? 'Members Kicked' : 'Kick Failed',
    description: [
      `> **Channel:** ${authorVc}`,
      `> **Kicked:** ${done} member${done === 1 ? '' : 's'}`,
      failedCount > 0 ? `> **Failed:** ${failedCount} member${failedCount === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

module.exports = {
  name: 'vckickall',
  aliases: ['vcdisconnectall', 'vcremoveall'],
  category: 'voice',
  description: 'Disconnects all members from your current voice channel (except you).',
  usage: 'LR!vckickall',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
