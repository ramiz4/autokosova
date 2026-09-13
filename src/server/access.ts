import { randomUUID } from 'node:crypto';

export type SystemRole = 'admin' | 'customer' | 'moderator';
export type MembershipRole = 'editor' | 'owner';

export interface Principal {
  readonly userId: string;
  readonly roles: ReadonlySet<SystemRole>;
  readonly sessionId: string;
  readonly csrfToken: string;
}

interface Session {
  readonly csrfToken: string;
  readonly expiresAt: Date;
  readonly userId: string;
}

interface Vehicle {
  readonly id: string;
  readonly label: string;
  readonly ownerUserId: string;
}

interface Membership {
  readonly role: MembershipRole;
  readonly userId: string;
  readonly workshopId: string;
}

interface PrivateFile {
  readonly id: string;
  readonly ownerUserId: string;
}

export interface FileGrant {
  readonly expiresAt: string;
  readonly fileId: string;
  readonly grantId: string;
}

export class AccessStore {
  readonly auditEvents: Array<{ actorUserId: string; type: string }> = [];
  private readonly files = new Map<string, PrivateFile>();
  private readonly memberships = new Map<string, Membership>();
  private readonly sessions = new Map<string, Session>();
  private readonly users = new Map<string, Set<SystemRole>>();
  private readonly vehicles = new Map<string, Vehicle>();

  addMembership(userId: string, workshopId: string, role: MembershipRole) {
    this.memberships.set(`${userId}:${workshopId}`, { role, userId, workshopId });
  }

  addRole(userId: string, role: SystemRole) {
    this.ensureUser(userId).add(role);
  }

  createSession(userId: string, expiresAt = new Date(Date.now() + 60 * 60 * 1000)) {
    this.ensureUser(userId);
    const sessionId = randomUUID();
    const csrfToken = randomUUID();
    this.sessions.set(sessionId, { csrfToken, expiresAt, userId });
    return { csrfToken, sessionId };
  }

  createVehicle(ownerUserId: string, label: string) {
    const id = randomUUID();
    this.vehicles.set(id, { id, label, ownerUserId });
    return id;
  }

  getFileGrant(userId: string, contentType: string, sizeBytes: number): FileGrant {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(contentType)) {
      throw new AccessError(415, 'Unsupported file type');
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) {
      throw new AccessError(413, 'Invalid file size');
    }

    const fileId = randomUUID();
    this.files.set(fileId, { id: fileId, ownerUserId: userId });
    return this.createGrant(fileId);
  }

  getPrincipal(sessionId: string | undefined, now = new Date()): Principal | undefined {
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    return {
      csrfToken: session.csrfToken,
      roles: this.ensureUser(session.userId),
      sessionId,
      userId: session.userId,
    };
  }

  issueDownloadGrant(principal: Principal, fileId: string): FileGrant {
    const file = this.files.get(fileId);
    if (!file || (file.ownerUserId !== principal.userId && !principal.roles.has('admin'))) {
      throw new AccessError(404, 'Private file not found');
    }
    return this.createGrant(fileId);
  }

  listVehicles(userId: string) {
    return [...this.vehicles.values()]
      .filter((vehicle) => vehicle.ownerUserId === userId)
      .map(({ id, label }) => ({ id, label }));
  }

  requireWorkshopMembership(principal: Principal, workshopId: string) {
    if (principal.roles.has('admin')) return;
    const membership = this.memberships.get(`${principal.userId}:${workshopId}`);
    if (!membership || !['editor', 'owner'].includes(membership.role)) {
      throw new AccessError(403, 'Workshop access denied');
    }
  }

  revokeSession(sessionId: string | undefined) {
    if (sessionId) this.sessions.delete(sessionId);
  }

  private createGrant(fileId: string): FileGrant {
    return {
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      fileId,
      grantId: randomUUID(),
    };
  }

  private ensureUser(userId: string) {
    const current = this.users.get(userId);
    if (current) return current;
    const roles = new Set<SystemRole>(['customer']);
    this.users.set(userId, roles);
    return roles;
  }
}

export class AccessError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
