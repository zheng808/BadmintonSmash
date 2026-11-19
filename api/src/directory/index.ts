import {
  AdminDeleteUserCommand, AdminGetUserCommand, CognitoIdentityProviderClient, ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/** Lookups against the identity provider (Cognito in AWS, a map in tests/local). */
export interface UserDirectory {
  getEmail(userId: string): Promise<string | undefined>;
  findUserIdByEmail(email: string): Promise<string | undefined>;
  deleteUser(userId: string): Promise<void>;
}

export class CognitoDirectory implements UserDirectory {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}

  async getEmail(userId: string): Promise<string | undefined> {
    try {
      const out = await this.client.send(new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: userId }));
      return out.UserAttributes?.find((a) => a.Name === 'email')?.Value;
    } catch (err) {
      if ((err as { name?: string }).name === 'UserNotFoundException') return undefined;
      throw err;
    }
  }

  async findUserIdByEmail(email: string): Promise<string | undefined> {
    if (email.includes('"') || email.includes('\\')) return undefined;
    const out = await this.client.send(
      new ListUsersCommand({ UserPoolId: this.userPoolId, Filter: `email = "${email.toLowerCase()}"`, Limit: 1 }),
    );
    const user = out.Users?.[0];
    return user?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? user?.Username;
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await this.client.send(new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: userId }));
    } catch (err) {
      if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
    }
  }
}

export class MemoryDirectory implements UserDirectory {
  private readonly emails = new Map<string, string>();

  /**
   * @param fallbackDomain when set (local dev with DEV_AUTH), unknown users resolve to
   *   `<userId>@<fallbackDomain>` so a fresh `x-dev-user` can act before ever calling /me.
   */
  constructor(private readonly fallbackDomain?: string) {}

  setEmail(userId: string, email: string): void {
    this.emails.set(userId, email.toLowerCase());
  }

  async getEmail(userId: string): Promise<string | undefined> {
    const known = this.emails.get(userId);
    if (known || !this.fallbackDomain) return known;
    const synthesized = `${userId.toLowerCase()}@${this.fallbackDomain}`;
    this.emails.set(userId, synthesized);
    return synthesized;
  }

  async findUserIdByEmail(email: string): Promise<string | undefined> {
    const target = email.toLowerCase();
    for (const [id, e] of this.emails) if (e === target) return id;
    return undefined;
  }

  async deleteUser(userId: string): Promise<void> {
    this.emails.delete(userId);
  }
}
