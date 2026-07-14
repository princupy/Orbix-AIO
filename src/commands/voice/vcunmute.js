const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, extractUserId, hasPerm, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vcunmute:delete:';

async function execute({ message, args }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.MuteMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Mute Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.MuteMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Mute Members** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const userId = extractUserId(args[0]);
  if (!userId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcunmute @user`' })));
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

  if (!member.voice.serverMute) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Not Muted', description: `${member} is not server muted.` })));
    return;
  }

  try {
    await member.voice.setMute(false, `vcunmute by ${message.author.tag}`);
    await message.reply(cv2Payload(vcContainer({
      type: 'success',
      title: 'Member Unmuted',
      description: `> **User:** ${member}\n> **Channel:** ${member.voice.channel}`,
      deletePrefix: DEL,
      ownerId,
    })));
  } catch (err) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Unmute Failed', description: err.code === 50013 ? 'Missing role hierarchy or **Mute Members** permission.' : err.message })));
  }
}

module.exports = {
  name: 'vcunmute',
  aliases: ['voiceunmute'],
  category: 'voice',
  description: 'Server unmutes a user in their voice channel.',
  usage: 'LR!vcunmute @user',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
