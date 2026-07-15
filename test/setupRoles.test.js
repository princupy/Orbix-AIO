const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField } = require('discord.js');
const {
  canConfigureSetupAccess,
  canConfigureSetupCommands,
  memberHasSetupRoleAccess,
  normalizeSetupRoleName,
  parseSetupRoleInvocation,
} = require('../src/utils/setupRoles');

function createMember({
  administrator = false,
  manageGuild = false,
  manageRoles = false,
  roleIds = [],
} = {}) {
  const roles = new Set(roleIds);

  return {
    id: 'test-user',
    permissions: {
      has(flag) {
        if (flag === PermissionsBitField.Flags.Administrator) {
          return administrator;
        }

        if (flag === PermissionsBitField.Flags.ManageGuild) {
          return manageGuild;
        }

        if (flag === PermissionsBitField.Flags.ManageRoles) {
          return manageRoles;
        }

        return false;
      },
    },
    roles: {
      cache: {
        has(roleId) {
          return roles.has(String(roleId));
        },
      },
    },
  };
}

test('normalizes valid setup-role command names', () => {
  assert.equal(normalizeSetupRoleName(' Girl '), 'girl');
  assert.equal(normalizeSetupRoleName('verified_user'), 'verified_user');
  assert.equal(normalizeSetupRoleName('vip-role'), 'vip-role');
});

test('rejects invalid setup-role command names', () => {
  assert.equal(normalizeSetupRoleName('a'), null);
  assert.equal(normalizeSetupRoleName('girl role'), null);
  assert.equal(normalizeSetupRoleName('girl!'), null);
  assert.equal(normalizeSetupRoleName('x'.repeat(33)), null);
});

test('parses a dynamic setup-role invocation', () => {
  assert.deepEqual(parseSetupRoleInvocation('Girl <@123456789012345678>'), {
    args: ['<@123456789012345678>'],
    commandName: 'girl',
  });
});

test('grants dynamic command access through a configured role', () => {
  const member = createMember({ roleIds: ['staff-role'] });

  assert.equal(
    memberHasSetupRoleAccess(member, new Set(['staff-role']), member.id),
    true,
  );
  assert.equal(
    memberHasSetupRoleAccess(member, new Set(['other-role']), member.id),
    false,
  );
});

test('allows administrators to bypass configured access roles', () => {
  const member = createMember({ administrator: true });

  assert.equal(
    memberHasSetupRoleAccess(member, new Set(), member.id),
    true,
  );
});

test('requires stronger permissions to create dynamic role commands', () => {
  const manageGuildOnly = createMember({ manageGuild: true });
  const fullManager = createMember({ manageGuild: true, manageRoles: true });

  assert.equal(canConfigureSetupAccess(manageGuildOnly, manageGuildOnly.id), true);
  assert.equal(canConfigureSetupCommands(manageGuildOnly, manageGuildOnly.id), false);
  assert.equal(canConfigureSetupCommands(fullManager, fullManager.id), true);
});
