const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, extractUserId, hasPerm, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vcundeafen:delete:';

async function execute({ message, args }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.DeafenMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Deafen Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.DeafenMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Deafen Members** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const userId = extractUserId(args[0]);
  if (!userId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcundeafen @user`' })));
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'User Not Found', description: 'Could not find that user in this server.' })));
    return;
  }

  if (!member.voice?.channel) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: `${member} is not in any voice channel.` })));
    return;
  }

  if (!member.voice.serverDeaf) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Not Deafened', description: `${member} is not server deafened.` })));
    return;
  }

  try {
    await member.voice.setDeaf(false, `vcundeafen by ${message.author.tag}`);
    await message.reply(cv2Payload(vcContainer({
      type: 'success',
      title: 'Member Undeafened',
      description: `> **User:** ${member}\n> **Channel:** ${member.voice.channel}`,
      deletePrefix: DEL,
      ownerId,
    })));
  } catch (err) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Undeafen Failed', description: err.code === 50013 ? 'Missing role hierarchy or **Deafen Members** permission.' : err.message })));
  }
}

module.exports = {
  name: 'vcundeafen',
  aliases: ['voiceundeafen'],
  category: 'voice',
  description: 'Removes server deafen from a user in their voice channel.',
  usage: 'LR!vcundeafen @user',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
